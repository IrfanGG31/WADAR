-- STK-0 / POS-1/2: stock in (weighted average), record_sale (allocation, idempotency,
-- stock guard, tenant guard) and on_hand = Σ movements.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
select public.create_shop('Toko Uji', 'toko-uji', 'kecantikan');

insert into public.products (id, tenant_id, name)
  select '10000000-0000-4000-8000-000000000001', id, 'Serum' from public.tenants where slug = 'toko-uji';
insert into public.products (id, tenant_id, name)
  select '10000000-0000-4000-8000-000000000002', id, 'Toner' from public.tenants where slug = 'toko-uji';
insert into public.variants (id, tenant_id, product_id, price)
  select '20000000-0000-4000-8000-000000000001', tenant_id, id, 100000 from public.products where name = 'Serum';
insert into public.variants (id, tenant_id, product_id, price)
  select '20000000-0000-4000-8000-000000000002', tenant_id, id, 50000 from public.products where name = 'Toner';

do $$
declare r record; res jsonb; res2 jsonb; t uuid; shopee uuid; pos uuid;
begin
  t := (select id from public.tenants where slug = 'toko-uji');
  shopee := (select id from public.channels where tenant_id = t and kind = 'shopee');
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');

  -- Weighted average: 10 @ 40.000 then 30 @ 44.000 → 43.000.
  perform public.stock_in('20000000-0000-4000-8000-000000000001', 10, 40000);
  select * into r from public.stock_in('20000000-0000-4000-8000-000000000001', 30, 44000);
  assert r.on_hand = 40 and r.avg_cost = 43000, format('weighted avg, got %s', r);
  perform public.stock_in('20000000-0000-4000-8000-000000000002', 20, 20000);

  -- Can't update on_hand directly.
  begin
    update public.variants set on_hand = 999 where true;
    raise exception 'on_hand directly updatable';
  exception when insufficient_privilege then null;
  end;

  -- Shopee sale: 2 serum + 1 toner, Rp25.000 voucher; fee 12% × 225.000 + 1.250 = 28.250.
  res := public.record_sale(t, shopee,
    '[{"variant_id":"20000000-0000-4000-8000-000000000001","qty":2},
      {"variant_id":"20000000-0000-4000-8000-000000000002","qty":1}]'::jsonb,
    'idem-key-0001', 25000, 0, 'marketplace', '+6281234567890', 'Ayu');
  assert (res->>'total')::bigint = 225000, format('total %s', res);
  assert (res->>'platform_fee')::bigint = 28250, format('fee %s', res);
  assert (select sum(alloc_order_discount) from public.sale_items) = 25000, 'discount fully allocated';
  assert (select sum(alloc_platform_fee) from public.sale_items) = 28250, 'fee fully allocated';
  -- 200.000 : 50.000 → 20.000 / 5.000 of the voucher.
  assert (select alloc_order_discount from public.sale_items where variant_id = '20000000-0000-4000-8000-000000000001') = 20000;
  assert (select unit_cost_snapshot from public.sale_items where variant_id = '20000000-0000-4000-8000-000000000001') = 43000;

  -- Same idempotency key → same sale, no second row, stock unchanged.
  res2 := public.record_sale(t, shopee,
    '[{"variant_id":"20000000-0000-4000-8000-000000000001","qty":2}]'::jsonb, 'idem-key-0001');
  assert (res2->>'duplicate')::boolean and res2->>'sale_id' = res->>'sale_id', 'idempotent replay';
  assert (select count(*) from public.sales) = 1, 'one sale only';
  assert (select on_hand from public.variants where id = '20000000-0000-4000-8000-000000000001') = 38;

  -- Customer created and its stats updated (CRM-1/2).
  assert (select orders_count from public.customers where phone_e164 = '+6281234567890') = 1;
  assert (select total_spent from public.customers where phone_e164 = '+6281234567890') = 225000;

  -- Not enough stock → rejected, nothing written.
  begin
    perform public.record_sale(t, pos, '[{"variant_id":"20000000-0000-4000-8000-000000000002","qty":50}]'::jsonb, 'idem-key-0002');
    raise exception 'oversell accepted';
  exception when raise_exception then
    if sqlerrm not like 'Stok %' then raise; end if;
  end;
  assert (select count(*) from public.sales) = 1, 'failed sale wrote nothing';

  -- POS sale has no fee.
  res := public.record_sale(t, pos, '[{"variant_id":"20000000-0000-4000-8000-000000000002","qty":3}]'::jsonb, 'idem-key-0003');
  assert (res->>'platform_fee')::bigint = 0;

  -- Invariant: on_hand = Σ movements for every variant.
  assert not exists (
    select 1 from public.variants v
     where v.on_hand <> (select coalesce(sum(qty), 0) from public.stock_movements m where m.variant_id = v.id)
  ), 'on_hand = Σ movements';
end $$;

-- Another shop can't sell this shop's stock.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1"}', true);
do $$ begin
  begin
    perform public.stock_in('20000000-0000-4000-8000-000000000001', 1, 1);
    raise exception 'foreign stock_in accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- alloc_lr matches src/core/money.ts test vectors.
reset role;
do $$ begin
  assert app.alloc_lr(100, array[1,1,1]::bigint[]) = array[34,33,33]::bigint[];
  assert app.alloc_lr(1001, array[7,7,6]::bigint[]) = array[351,350,300]::bigint[];
  assert app.alloc_lr(5, array[1,1,1]::bigint[]) = array[2,2,1]::bigint[];
  assert app.alloc_lr(11, array[3,3,4]::bigint[]) = array[3,3,5]::bigint[];
  assert app.alloc_lr(-100, array[1,1,1]::bigint[]) = array[-34,-33,-33]::bigint[];
  assert app.alloc_lr(0, array[0,0]::bigint[]) = array[0,0]::bigint[];
end $$;
rollback;
\o
select 'stock_sales: ok' as result;
