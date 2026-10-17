-- GAP #3: import_catalog creates products/variants with opening stock, a bad row does not stop
-- the others, importing the same SKUs again updates (no duplicate, no doubled stock), and the
-- run is logged in catalog_imports. Members only.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
select public.create_shop('Toko Impor', 'toko-impor', 'kecantikan');

do $$
declare t uuid; res jsonb; r record;
begin
  t := (select id from public.tenants where slug = 'toko-impor');
  res := public.import_catalog(t, 'katalog.csv', '[
    {"line": 2, "name": "Serum Vit C", "option_label": "20 ml", "sku": "SVC-20", "price": 89000, "cost": 35000, "initial_qty": 12, "category": "Serum", "unit": "botol", "min_stock": 5, "description": ""},
    {"line": 3, "name": "Serum Vit C", "option_label": "Mini", "sku": "SVC-M", "price": 25000, "cost": null, "initial_qty": 3, "category": "Serum", "unit": "", "min_stock": null, "description": ""},
    {"line": 4, "name": "Toner", "option_label": "", "sku": "TN-1", "price": -1, "cost": 0, "initial_qty": 0, "category": "", "unit": "", "min_stock": null, "description": ""},
    {"line": 5, "name": "Lip Tint", "option_label": "", "sku": "LT-1", "price": 45000, "cost": 15000, "initial_qty": 0, "category": "Bibir", "unit": "", "min_stock": null, "description": ""}
  ]'::jsonb, '[{"line": 6, "sku": "", "message": "SKU wajib diisi"}]'::jsonb);

  assert (res->>'created')::int = 3 and (res->>'updated')::int = 0, format('first run %s', res);
  assert jsonb_array_length(res->'errors') = 1 and res->'errors'->0->>'sku' = 'TN-1', format('bad row reported %s', res->'errors');
  assert (select count(*) from public.products where tenant_id = t) = 2, 'same name = one product';
  select on_hand, avg_cost, cost_is_set, min_stock into r from public.variants where sku = 'SVC-20';
  assert r.on_hand = 12 and r.avg_cost = 35000 and r.cost_is_set and r.min_stock = 5, format('SVC-20 %s', r);
  select on_hand, avg_cost, cost_is_set into r from public.variants where sku = 'SVC-M';
  assert r.on_hand = 3 and r.avg_cost = 0 and not r.cost_is_set, format('empty HPP = belum diisi %s', r);
  assert not exists (select 1 from public.variants where sku = 'TN-1'), 'bad row rolled back alone';
  select rows_total, created_count, updated_count, failed_count into r from public.catalog_imports where tenant_id = t;
  assert r.rows_total = 5 and r.created_count = 3 and r.updated_count = 0 and r.failed_count = 2, format('log %s', r);

  -- Same SKUs again (one in other case): update, no duplicate, stock not added again, empty HPP kept.
  res := public.import_catalog(t, 'katalog.csv', '[
    {"line": 2, "name": "Serum Vit C", "option_label": "20 ml", "sku": "svc-20", "price": 95000, "cost": 36000, "initial_qty": 12, "category": "", "unit": "", "min_stock": null, "description": ""},
    {"line": 3, "name": "Serum Vit C", "option_label": "Mini", "sku": "SVC-M", "price": 27000, "cost": null, "initial_qty": 3, "category": "", "unit": "", "min_stock": null, "description": ""}
  ]'::jsonb);
  assert (res->>'created')::int = 0 and (res->>'updated')::int = 2, format('second run %s', res);
  assert (select count(*) from public.variants where tenant_id = t) = 3, 'no duplicate variants';
  select on_hand, price, avg_cost, min_stock into r from public.variants where sku = 'SVC-20';
  assert r.on_hand = 12 and r.price = 95000 and r.avg_cost = 36000 and r.min_stock = 5, format('updated SVC-20 %s', r);
  assert (select category from public.products p join public.variants v on v.product_id = p.id where v.sku = 'SVC-20') = 'Serum', 'empty category keeps old';
  assert (select count(*) from public.stock_movements where tenant_id = t) = 2, 'opening stock booked once';
  assert (select count(*) from public.catalog_imports where tenant_id = t) = 2;

  -- on_hand = Σ movements.
  assert not exists (
    select 1 from public.variants v
     where v.on_hand <> (select coalesce(sum(qty), 0) from public.stock_movements m where m.variant_id = v.id)
  ), 'on_hand = Σ movements';
end $$;

-- Another user can't import into this shop, nor read its import log.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1"}', true);
do $$ begin
  assert (select count(*) from public.catalog_imports) = 0, 'import log is tenant-scoped';
  begin
    perform public.import_catalog((select tenant_id from public.memberships limit 1), 'x.csv', '[]'::jsonb);
    raise exception 'foreign import accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
\o
select 'catalog import: ok' as result;
