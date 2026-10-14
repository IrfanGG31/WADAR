-- CAT-1 / STK-0: save_product creates and edits products with variants atomically,
-- opening stock is a purchase movement, and HPP 0 stays "belum diisi".
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
select public.create_shop('Toko Katalog', 'toko-katalog', 'kecantikan');

do $$
declare t uuid; p uuid; v1 uuid; v2 uuid; r record;
begin
  t := (select id from public.tenants where slug = 'toko-katalog');
  p := public.save_product(t, null, '{
    "name": "Serum Vit C", "category": "Serum", "unit": "botol",
    "variants": [
      {"option_label": "20 ml", "sku": "SVC-20", "price": 89000, "cost": 35000, "min_stock": 5, "lead_time_days": 4, "pack_size": 6, "initial_qty": 12},
      {"option_label": "Mini", "sku": "SVC-M", "price": 25000, "cost": 0, "initial_qty": 3}
    ]}'::jsonb);
  v1 := (select id from public.variants where sku = 'SVC-20');
  v2 := (select id from public.variants where sku = 'SVC-M');

  select on_hand, avg_cost, cost_is_set, pack_size into r from public.variants where id = v1;
  assert r.on_hand = 12 and r.avg_cost = 35000 and r.cost_is_set and r.pack_size = 6, format('v1 %s', r);
  select on_hand, avg_cost, cost_is_set into r from public.variants where id = v2;
  assert r.on_hand = 3 and r.avg_cost = 0 and not r.cost_is_set, format('HPP 0 stays unset, got %s', r);
  assert (select count(*) from public.stock_movements where kind = 'purchase') = 2, 'opening stock is a purchase';

  -- First priced stock-in on a variant without HPP sets the average outright.
  select * into r from public.stock_in(v2, 7, 10000);
  assert r.on_hand = 10 and r.avg_cost = 10000, format('first priced batch, got %s', r);
  assert (select cost_is_set from public.variants where id = v2);

  -- Edit: rename, change price/HPP, add a variant; stock is untouched.
  perform public.save_product(t, p, format('{
    "name": "Serum Vitamin C", "category": "Serum", "unit": "botol",
    "variants": [
      {"id": "%s", "option_label": "20 ml", "sku": "SVC-20", "price": 95000, "cost": 36000, "min_stock": 6, "lead_time_days": 4, "pack_size": 6},
      {"id": "%s", "option_label": "Mini", "sku": "SVC-M", "price": 25000, "cost": 10000},
      {"option_label": "50 ml", "sku": "SVC-50", "price": 159000, "cost": 70000}
    ]}', v1, v2)::jsonb);
  assert (select name from public.products where id = p) = 'Serum Vitamin C';
  select on_hand, price, avg_cost into r from public.variants where id = v1;
  assert r.on_hand = 12 and r.price = 95000 and r.avg_cost = 36000, format('edited v1 %s', r);
  assert (select count(*) from public.variants where product_id = p) = 3;

  -- Duplicate SKU → whole save rolls back (no orphan product).
  begin
    perform public.save_product(t, null, '{"name": "Toner", "variants": [{"sku": "SVC-20", "price": 50000, "cost": 20000}]}'::jsonb);
    raise exception 'duplicate sku accepted';
  exception when unique_violation then null;
  end;
  assert not exists (select 1 from public.products where name = 'Toner'), 'no orphan product';

  -- No variants → rejected.
  begin
    perform public.save_product(t, null, '{"name": "Kosong", "variants": []}'::jsonb);
    raise exception 'empty variants accepted';
  exception when invalid_parameter_value then null;
  end;

  -- on_hand = Σ movements.
  assert not exists (
    select 1 from public.variants v
     where v.on_hand <> (select coalesce(sum(qty), 0) from public.stock_movements m where m.variant_id = v.id)
  ), 'on_hand = Σ movements';
end $$;

-- Another user can't write into this shop's catalog.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1"}', true);
do $$ begin
  begin
    perform public.save_product((select id from public.tenants where slug = 'toko-katalog'), null,
      '{"name": "Titipan", "variants": [{"price": 1, "cost": 1}]}'::jsonb);
    raise exception 'foreign save accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
\o
select 'catalog: ok' as result;
