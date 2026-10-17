-- U1: rollup_daily builds fin_daily_rollup / stock_daily_rollup from sample transactions,
-- a re-run gives the same rows (and picks up a late sale), only the service role runs it,
-- and members read only their own shop's rollups.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
select public.create_shop('Toko Rollup', 'toko-rollup', 'kecantikan');
reset role;

-- Sample data written as the table owner with fixed times (Asia/Jakarta, +07).
do $$
declare t uuid; pos uuid; shopee uuid; v uuid := '20000000-0000-4000-8000-0000000000f1';
begin
  t := (select id from public.tenants where slug = 'toko-rollup');
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  shopee := (select id from public.channels where tenant_id = t and kind = 'shopee');
  insert into public.products (id, tenant_id, name) values ('10000000-0000-4000-8000-0000000000f1', t, 'Serum');
  insert into public.variants (id, tenant_id, product_id, price, created_at)
    values (v, t, '10000000-0000-4000-8000-0000000000f1', 100000, '2026-10-01 08:00+07');

  insert into public.stock_movements (tenant_id, variant_id, qty, kind, occurred_at) values
    (t, v, 10, 'purchase',  '2026-10-09 10:00+07'),
    (t, v, -3, 'sale',      '2026-10-10 11:00+07'),
    (t, v, -1, 'adjustment','2026-10-10 15:00+07'),
    (t, v, -1, 'sale',      '2026-10-10 23:30+07'),  -- still 10 Oct in WIB (16.30 UTC)
    (t, v, 5,  'purchase',  '2026-10-11 09:00+07'),
    (t, v, -2, 'sale',      '2026-10-11 20:00+07'),
    (t, v, -1, 'sale',      '2026-10-12 08:00+07');  -- after the window
  update public.variants set on_hand = 7 where id = v;   -- = Σ movements

  insert into public.sales (id, tenant_id, channel_id, source, subtotal, total, occurred_at) values
    ('30000000-0000-4000-8000-0000000000f1', t, pos, 'pos', 295000, 295000, '2026-10-10 11:00+07'),
    ('30000000-0000-4000-8000-0000000000f2', t, pos, 'pos', 100000, 100000, '2026-10-10 23:30+07'),
    ('30000000-0000-4000-8000-0000000000f4', t, shopee, 'manual', 200000, 200000, '2026-10-11 20:00+07');
  insert into public.sales (id, tenant_id, channel_id, source, status, subtotal, total, occurred_at) values
    ('30000000-0000-4000-8000-0000000000f3', t, pos, 'pos', 'void', 100000, 100000, '2026-10-11 10:00+07');
  insert into public.sale_items (tenant_id, sale_id, variant_id, name_snapshot, qty, unit_price, line_discount, unit_cost_snapshot, alloc_platform_fee) values
    (t, '30000000-0000-4000-8000-0000000000f1', v, 'Serum', 3, 100000, 5000, 40000, 0),
    (t, '30000000-0000-4000-8000-0000000000f2', v, 'Serum', 1, 100000, 0, 40000, 0),
    (t, '30000000-0000-4000-8000-0000000000f3', v, 'Serum', 1, 100000, 0, 40000, 0),
    (t, '30000000-0000-4000-8000-0000000000f4', v, 'Serum', 2, 100000, 0, 40000, 20000);
end $$;

do $$
declare t uuid := (select id from public.tenants where slug = 'toko-rollup');
        r record; f record; s record; v uuid := '20000000-0000-4000-8000-0000000000f1';
begin
  set local role service_role;
  select * into r from public.rollup_daily(t, '2026-10-10', '2026-10-11');
  assert r.fin_rows = 2 and r.stock_rows = 2, format('row counts, got %s', r);

  select * into f from public.fin_daily_rollup where tenant_id = t and day = '2026-10-10';
  assert f.q = 4 and f.revenue_gross = 400000 and f.line_discount = 5000 and f.cost = 160000 and f.platform_fee_alloc = 0,
    format('10 Oct pos (void sale excluded), got %s', f);
  select * into f from public.fin_daily_rollup where tenant_id = t and day = '2026-10-11';
  assert f.q = 2 and f.revenue_gross = 200000 and f.platform_fee_alloc = 20000, format('11 Oct shopee, got %s', f);

  select * into s from public.stock_daily_rollup where variant_id = v and day = '2026-10-10';
  assert (s.opening, s.stock_in, s.sold, s.stock_out_other, s.closing) = (10, 0, 4, 1, 5), format('stock 10 Oct, got %s', s);
  select * into s from public.stock_daily_rollup where variant_id = v and day = '2026-10-11';
  assert (s.opening, s.stock_in, s.sold, s.stock_out_other, s.closing) = (5, 5, 2, 0, 8), format('stock 11 Oct, got %s', s);

  -- Re-run: same rows, no duplicates.
  select * into r from public.rollup_daily(t, '2026-10-10', '2026-10-11');
  assert r.fin_rows = 2 and r.stock_rows = 2;
  assert (select count(*) from public.fin_daily_rollup where tenant_id = t) = 2, 'idempotent fin';
  assert (select count(*) from public.stock_daily_rollup where tenant_id = t) = 2, 'idempotent stock';
  assert (select sum(revenue_gross) from public.fin_daily_rollup where tenant_id = t) = 600000;

  -- Bad range is refused.
  begin
    perform public.rollup_daily(t, '2026-10-11', '2026-10-10');
    raise exception 'reversed range accepted';
  exception when invalid_parameter_value then null;
  end;
  reset role;
end $$;

-- Owner reads own rollups but cannot write them or run the job; another user sees nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
do $$ declare t uuid := (select id from public.tenants where slug = 'toko-rollup'); begin
  assert (select count(*) from public.fin_daily_rollup) = 2, 'owner reads own rollup';
  begin
    perform public.rollup_daily(t, '2026-10-10', '2026-10-11');
    raise exception 'member ran rollup_daily';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.stock_daily_rollup where tenant_id = t;
    raise exception 'member deleted rollup rows';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1"}', true);
do $$ begin
  assert (select count(*) from public.fin_daily_rollup) = 0, 'fin rollup is tenant-scoped';
  assert (select count(*) from public.stock_daily_rollup) = 0, 'stock rollup is tenant-scoped';
end $$;
rollback;
\o
select 'daily rollups: ok' as result;
