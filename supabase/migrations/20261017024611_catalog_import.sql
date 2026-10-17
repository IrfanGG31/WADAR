-- GAP #3 — impor katalog dari file CSV (PDF §A.2, §C.2): produk + varian + HPP + stok awal.
-- The app parses and validates the file (src/core/catalog-import.ts) and sends the valid rows here.
-- SKU is the idempotency key (case-insensitive, per shop): a known SKU updates its variant,
-- a new SKU creates one (rows with the same product name share a product). Opening stock is
-- booked only for new variants, so importing the same file twice never doubles the stock.
-- Every row runs in its own subtransaction: a bad row is reported, the rest still import.
-- Each run is logged in catalog_imports (counts + per-row errors, no file content).

create table public.catalog_imports (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  file_name text check (char_length(file_name) <= 200),
  rows_total int not null check (rows_total >= 0),
  created_count int not null check (created_count >= 0),
  updated_count int not null check (updated_count >= 0),
  failed_count int not null check (failed_count >= 0),
  errors jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index catalog_imports_tenant_time_idx on public.catalog_imports (tenant_id, created_at desc);
create index catalog_imports_created_by_idx on public.catalog_imports (created_by);
-- SKU lookup during import is case-insensitive.
create index variants_tenant_lower_sku_idx on public.variants (tenant_id, lower(sku));

alter table public.catalog_imports enable row level security;
create policy member_select on public.catalog_imports for select to authenticated using (app.is_member(tenant_id));
create policy member_insert on public.catalog_imports for insert to authenticated with check (app.is_member(tenant_id));

-- The log is append-only for app users.
revoke all on public.catalog_imports from public, anon, authenticated;
grant select, insert on public.catalog_imports to authenticated;
grant all on public.catalog_imports to service_role;

-- p_rows: [{line, name, option_label, sku, price, cost|null, initial_qty, category, unit, min_stock|null, description}]
-- p_rejected: rows the app already rejected [{line, sku, message}] — only logged.
-- Runs as the caller: RLS and the column grants on variants apply; stock goes through stock_in.
create or replace function public.import_catalog(p_tenant_id uuid, p_file_name text, p_rows jsonb, p_rejected jsonb default '[]')
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_sku text;
  v_name text;
  v_variant public.variants;
  v_product_id uuid;
  v_variant_id uuid;
  v_price bigint;
  v_cost bigint;
  v_qty int;
  v_results jsonb := '[]';
  v_errors jsonb := '[]';
  v_created int := 0;
  v_updated int := 0;
  v_batch uuid;
begin
  perform app.assert_member(p_tenant_id);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Baris impor tidak valid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Maksimal 2000 baris per impor' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_sku := nullif(trim(r->>'sku'), '');
    v_name := trim(coalesce(r->>'name', ''));
    begin
      if v_sku is null then raise exception 'SKU wajib diisi' using errcode = '22023'; end if;
      if v_name = '' then raise exception 'Nama produk wajib diisi' using errcode = '22023'; end if;
      v_price := (r->>'price')::bigint;
      v_cost := (r->>'cost')::bigint;
      if v_price is null or v_price < 0 then raise exception 'Harga jual tidak valid' using errcode = '22023'; end if;
      if v_cost < 0 then raise exception 'HPP tidak valid' using errcode = '22023'; end if;

      select * into v_variant from public.variants
       where tenant_id = p_tenant_id and lower(sku) = lower(v_sku)
       limit 1 for update;

      if found then
        if exists (select 1 from public.products where id = v_variant.product_id and deleted_at is not null) then
          raise exception 'SKU % dipakai produk yang sudah diarsipkan', v_sku using errcode = '55000';
        end if;
        update public.products
           set name = v_name,
               category = coalesce(nullif(trim(r->>'category'), ''), category),
               unit = coalesce(nullif(trim(r->>'unit'), ''), unit),
               description = coalesce(nullif(trim(r->>'description'), ''), description)
         where id = v_variant.product_id and tenant_id = p_tenant_id;
        -- Empty HPP keeps the current one; a filled HPP sets the average directly (same as editing).
        update public.variants
           set option_label = nullif(trim(r->>'option_label'), ''),
               price = v_price,
               avg_cost = coalesce(v_cost, avg_cost),
               cost_is_set = case when v_cost is null then cost_is_set else v_cost > 0 end,
               min_stock = coalesce((r->>'min_stock')::int, min_stock)
         where id = v_variant.id;
        v_updated := v_updated + 1;
        v_results := v_results || jsonb_build_object('line', r->'line', 'sku', v_sku, 'action', 'updated');
      else
        select id into v_product_id from public.products
         where tenant_id = p_tenant_id and deleted_at is null and lower(name) = lower(v_name)
         order by created_at, id limit 1;
        if not found then
          insert into public.products (tenant_id, name, category, description, unit)
          values (p_tenant_id, v_name, nullif(trim(r->>'category'), ''), nullif(trim(r->>'description'), ''),
                  coalesce(nullif(trim(r->>'unit'), ''), 'pcs'))
          returning id into v_product_id;
        end if;
        insert into public.variants (tenant_id, product_id, option_label, sku, price, avg_cost, cost_is_set, min_stock)
        values (p_tenant_id, v_product_id, nullif(trim(r->>'option_label'), ''), v_sku, v_price,
                coalesce(v_cost, 0), coalesce(v_cost, 0) > 0, coalesce((r->>'min_stock')::int, 0))
        returning id into v_variant_id;
        v_qty := coalesce((r->>'initial_qty')::int, 0);
        if v_qty > 0 then
          perform public.stock_in(v_variant_id, v_qty, coalesce(v_cost, 0), 'Stok awal (impor)');
        end if;
        v_created := v_created + 1;
        v_results := v_results || jsonb_build_object('line', r->'line', 'sku', v_sku, 'action', 'created');
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'line', r->'line',
        'sku', coalesce(v_sku, ''),
        'message', case
          when sqlstate in ('22023', '55000') then sqlerrm
          when sqlstate = '23505' then 'SKU sudah dipakai varian lain.'
          when sqlstate in ('23514', '22003', '22P02') then 'Ada isian di luar batas.'
          else 'Baris ini belum bisa disimpan.'
        end);
    end;
  end loop;

  insert into public.catalog_imports (tenant_id, file_name, rows_total, created_count, updated_count, failed_count, errors)
  values (p_tenant_id, left(nullif(trim(p_file_name), ''), 200),
          jsonb_array_length(p_rows) + coalesce(jsonb_array_length(p_rejected), 0),
          v_created, v_updated, jsonb_array_length(v_errors) + coalesce(jsonb_array_length(p_rejected), 0),
          coalesce(p_rejected, '[]') || v_errors)
  returning id into v_batch;

  return jsonb_build_object('batch_id', v_batch, 'created', v_created, 'updated', v_updated,
                            'results', v_results, 'errors', v_errors);
end $$;

revoke execute on function public.import_catalog(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_catalog(uuid, text, jsonb, jsonb) to authenticated;
