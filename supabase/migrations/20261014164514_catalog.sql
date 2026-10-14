-- D2 catalog: stock-in keeps "HPP belum diisi" honest, and products with their
-- variants (plus opening stock) are saved in one transaction.

-- Stock in: a zero unit cost does not mark HPP as filled, and the first priced
-- batch of a variant without HPP sets the average outright (no blend with 0).
create or replace function public.stock_in(p_variant_id uuid, p_qty int, p_unit_cost bigint, p_note text default null)
returns table (on_hand int, avg_cost bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v public.variants;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Jumlah stok masuk harus lebih dari 0' using errcode = '22023'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga modal tidak valid' using errcode = '22023'; end if;

  select * into v from public.variants where id = p_variant_id for update;
  if not found then raise exception 'Produk tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_member(v.tenant_id);

  insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, created_by)
  values (v.tenant_id, v.id, p_qty, 'purchase', p_unit_cost, nullif(p_note, ''), auth.uid());

  return query
  update public.variants
     set on_hand = variants.on_hand + p_qty,
         avg_cost = case when variants.cost_is_set
                         then app.weighted_avg_cost(variants.on_hand, variants.avg_cost, p_qty, p_unit_cost)
                         else p_unit_cost end,
         cost_is_set = variants.cost_is_set or p_unit_cost > 0
   where id = v.id
  returning variants.on_hand, variants.avg_cost;
end $$;

-- Create or edit a product and its variants atomically (CAT-1). Runs as the
-- caller, so RLS and the column grants on variants still apply. p_product:
-- {name, category, description, unit, image_path,
--  variants: [{id?, option_label, sku, price, cost, min_stock, lead_time_days, pack_size, initial_qty?}]}
-- cost 0 = "HPP belum diisi". Editing cost sets the average HPP directly.
-- initial_qty (new variants only) is booked as a purchase via stock_in.
create or replace function public.save_product(p_tenant_id uuid, p_product_id uuid, p_product jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_product_id uuid := p_product_id;
  v jsonb;
  v_variant_id uuid;
  v_cost bigint;
  v_qty int;
begin
  perform app.assert_member(p_tenant_id);
  if jsonb_typeof(p_product->'variants') is distinct from 'array' or jsonb_array_length(p_product->'variants') = 0 then
    raise exception 'Minimal satu varian' using errcode = '22023';
  end if;

  if v_product_id is null then
    insert into public.products (tenant_id, name, category, description, unit, image_path)
    values (p_tenant_id, trim(p_product->>'name'), nullif(trim(p_product->>'category'), ''),
            nullif(trim(p_product->>'description'), ''), coalesce(nullif(trim(p_product->>'unit'), ''), 'pcs'),
            nullif(trim(p_product->>'image_path'), ''))
    returning id into v_product_id;
  else
    update public.products
       set name = trim(p_product->>'name'),
           category = nullif(trim(p_product->>'category'), ''),
           description = nullif(trim(p_product->>'description'), ''),
           unit = coalesce(nullif(trim(p_product->>'unit'), ''), 'pcs'),
           image_path = nullif(trim(p_product->>'image_path'), '')
     where id = v_product_id and tenant_id = p_tenant_id and deleted_at is null;
    if not found then raise exception 'Produk tidak ditemukan' using errcode = 'P0002'; end if;
  end if;

  for v in select value from jsonb_array_elements(p_product->'variants') loop
    v_cost := coalesce((v->>'cost')::bigint, 0);
    if v_cost < 0 or coalesce((v->>'price')::bigint, -1) < 0 then
      raise exception 'Harga tidak valid' using errcode = '22023';
    end if;

    if nullif(v->>'id', '') is not null then
      update public.variants
         set option_label = nullif(trim(v->>'option_label'), ''),
             sku = nullif(trim(v->>'sku'), ''),
             price = (v->>'price')::bigint,
             avg_cost = v_cost,
             cost_is_set = v_cost > 0,
             min_stock = coalesce((v->>'min_stock')::int, 0),
             lead_time_days = coalesce((v->>'lead_time_days')::int, 3),
             pack_size = coalesce((v->>'pack_size')::int, 1)
       where id = (v->>'id')::uuid and product_id = v_product_id and tenant_id = p_tenant_id;
      if not found then raise exception 'Varian tidak ditemukan' using errcode = 'P0002'; end if;
    else
      insert into public.variants (tenant_id, product_id, option_label, sku, price, avg_cost, cost_is_set,
                                   min_stock, lead_time_days, pack_size)
      values (p_tenant_id, v_product_id, nullif(trim(v->>'option_label'), ''), nullif(trim(v->>'sku'), ''),
              (v->>'price')::bigint, v_cost, v_cost > 0, coalesce((v->>'min_stock')::int, 0),
              coalesce((v->>'lead_time_days')::int, 3), coalesce((v->>'pack_size')::int, 1))
      returning id into v_variant_id;
      v_qty := coalesce((v->>'initial_qty')::int, 0);
      if v_qty > 0 then
        perform public.stock_in(v_variant_id, v_qty, v_cost, 'Stok awal');
      end if;
    end if;
  end loop;
  return v_product_id;
end $$;

revoke execute on function public.save_product(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_product(uuid, uuid, jsonb) to authenticated;
