-- POS-5: void_sale keeps the sale row (status 'void'), returns its stock through 'void'
-- movements (on_hand = Σ movements), reverses the customer's stats, is idempotent, owner /
-- service role only, and the sale disappears from fin_daily, stock_daily_series and the rollups.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000018a1', 'owner@test.local'),
  ('00000000-0000-4000-8000-0000000018b1', 'kasir@test.local'),
  ('00000000-0000-4000-8000-0000000018c1', 'luar@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000018a1"}', true);
select set_config('test.t', (public.create_shop('Toko Void', 'toko-void', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('18000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price, created_at)
  values ('18000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid,
          '18000000-0000-4000-8000-000000000001', 100000, now() - interval '10 days');
select public.stock_in('18000000-0000-4000-8000-000000000002', 10, 40000);
-- the stock-in is older than every sale below
reset role;
update public.stock_movements set occurred_at = now() - interval '5 days'
 where variant_id = '18000000-0000-4000-8000-000000000002';
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000018b1', 'cashier');
set local role authenticated;

-- Sale today (with a customer) and a sale two days ago.
do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; res jsonb;
begin
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  res := public.record_sale(t, pos, '[{"variant_id":"18000000-0000-4000-8000-000000000002","qty":3}]', 'void-sale-today',
                            p_customer_phone => '+6281234567890', p_customer_name => 'Rina');
  perform set_config('test.today', res->>'sale_id', true);
  res := public.record_sale(t, pos, '[{"variant_id":"18000000-0000-4000-8000-000000000002","qty":2}]', 'void-sale-old',
                            p_occurred_at => now() - interval '2 days');
  perform set_config('test.old', res->>'sale_id', true);
  assert (select on_hand from public.variants where id = '18000000-0000-4000-8000-000000000002') = 5, 'sold 5';
end $$;

-- Freeze the closed days before the void (as the cron would).
reset role;
set local role service_role;
do $$
declare t uuid := current_setting('test.t')::uuid; d date := ((now() at time zone 'Asia/Jakarta')::date);
begin
  perform public.rollup_daily(t, d - 3, d - 1);
  assert (select sum(q) from public.fin_daily_rollup where tenant_id = t) = 2, 'old sale rolled up';
  assert (select sold from public.stock_daily_rollup where tenant_id = t and day = d - 2) = 2, 'old sale in stock rollup';
end $$;
reset role;
set local role authenticated;

-- A cashier and an outsider cannot void.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000018b1"}', true);
do $$ begin
  begin
    perform public.void_sale(current_setting('test.today')::uuid);
    raise exception 'cashier voided a sale';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000018c1"}', true);
do $$ begin
  begin
    perform public.void_sale(current_setting('test.today')::uuid);
    raise exception 'outsider voided a sale';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The owner voids today's sale.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000018a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; s uuid := current_setting('test.today')::uuid;
        v uuid := '18000000-0000-4000-8000-000000000002'; res jsonb; c record; sale record;
begin
  -- the app cannot flip the status itself
  begin
    update public.sales set status = 'void' where id = s;
    raise exception 'sales row updatable by the app';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.void_sale(s, repeat('x', 201));
    raise exception 'over-long reason accepted';
  exception when invalid_parameter_value then null;
  end;

  res := public.void_sale(s, ' salah input ');
  assert (res->>'already_void')::boolean = false and (res->>'restocked')::int = 3, format('void result, got %s', res);
  select * into sale from public.sales where id = s;
  assert sale.status = 'void' and sale.voided_at is not null and sale.void_reason = 'salah input'
     and sale.voided_by = '00000000-0000-4000-8000-0000000018a1', format('sale row kept, got %s', sale);
  assert (select count(*) from public.sale_items where sale_id = s) = 1, 'items kept';
  assert (select on_hand from public.variants where id = v) = 8, 'stock back';
  assert (select sum(qty) from public.stock_movements where variant_id = v) = 8, 'on_hand = Σ movements';
  assert (select count(*) from public.stock_movements where ref_id = s and kind = 'void' and qty = 3) = 1, 'void movement';
  select * into c from public.customers where tenant_id = t;
  assert c.orders_count = 0 and c.total_spent = 0 and c.last_order_at is null, format('customer reversed, got %s', c);
  assert (select coalesce(sum(q), 0) from public.fin_daily
           where tenant_id = t and day = ((now() at time zone 'Asia/Jakarta')::date)) = 0, 'not in fin_daily';
  assert (select sold from public.stock_daily_series(t, 3)
           where variant_id = v and day = ((now() at time zone 'Asia/Jakarta')::date)) = 0, 'not in stock series';

  -- idempotent
  res := public.void_sale(s);
  assert (res->>'already_void')::boolean and (select on_hand from public.variants where id = v) = 8, 'second void is a no-op';
end $$;

-- Voiding an already rolled-up sale rebuilds the frozen days.
do $$
declare t uuid := current_setting('test.t')::uuid; v uuid := '18000000-0000-4000-8000-000000000002';
        d date := ((now() at time zone 'Asia/Jakarta')::date); r record;
begin
  perform public.void_sale(current_setting('test.old')::uuid);
  assert (select on_hand from public.variants where id = v) = 10, 'all stock back';
  assert (select count(*) from public.fin_daily_rollup where tenant_id = t) = 0, 'fin rollup dropped the voided sale';
  select * into r from public.stock_daily_rollup where tenant_id = t and day = d - 2;
  assert r.sold = 0 and r.opening = 10 and r.closing = 10, format('stock rollup rebuilt, got %s', r);
  assert (select sum(sold) from public.stock_daily_series(t, 5) where variant_id = v) = 0, 'series ignores voided sales';
end $$;

-- Unknown sale.
do $$ begin
  begin
    perform public.void_sale('18000000-0000-4000-8000-0000000000ff');
    raise exception 'unknown sale voided';
  exception when no_data_found then null;
  end;
end $$;
rollback;
\o
select 'sale void: ok' as result;
