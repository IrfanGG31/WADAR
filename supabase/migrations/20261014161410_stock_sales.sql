-- 0002 stock & sales — STK-0 (stock in, weighted avg cost), POS-1/2 (record_sale),
-- TECH-SPEC §3 (append-only, idempotency) and §7.2 (largest-remainder allocation).
--
-- on_hand / avg_cost and every sales row change only through the functions below
-- (security definer + explicit membership checks), so `on_hand = Σ stock_movements`
-- holds by construction. App users keep read access through RLS.

-- ── Tighten grants: writes to stock & sales only via functions ───────────────
revoke insert on public.stock_movements, public.sales, public.sale_items from authenticated;
revoke insert, update on public.variants from authenticated;
grant insert (id, tenant_id, product_id, sku, barcode, option_label, price, avg_cost, cost_is_set,
              min_stock, lead_time_days, pack_size)
  on public.variants to authenticated;
grant update (sku, barcode, option_label, price, avg_cost, cost_is_set, min_stock, lead_time_days, pack_size)
  on public.variants to authenticated;
-- Customer stats are maintained by record_sale; users edit only identity/notes.
revoke update on public.customers from authenticated;
grant update (name, phone_e164, notes, tags) on public.customers to authenticated;

-- ── Largest remainder (same contract as src/core/money.ts allocateLargestRemainder) ──
-- Parts are whole rupiah, sum to exactly p_total; leftover rupiah go to the largest
-- remainders, ties to the earlier index. Negative total = negated split of |total|.
create or replace function app.alloc_lr(p_total bigint, p_weights bigint[])
returns bigint[] language plpgsql immutable set search_path = '' as $$
declare
  n int := coalesce(array_length(p_weights, 1), 0);
  w_sum numeric := 0;
  parts bigint[] := '{}';
  rems numeric[] := '{}';
  leftover bigint;
  best int;
  i int;
  neg boolean := p_total < 0;
  total bigint := abs(p_total);
begin
  if n = 0 then
    if total <> 0 then raise exception 'alloc_lr: nothing to allocate % over', p_total; end if;
    return '{}';
  end if;
  for i in 1..n loop
    if p_weights[i] < 0 then raise exception 'alloc_lr: negative weight'; end if;
    w_sum := w_sum + p_weights[i];
  end loop;
  if w_sum = 0 then
    if total <> 0 then raise exception 'alloc_lr: non-zero total over zero weights'; end if;
    return array_fill(0::bigint, array[n]);
  end if;
  leftover := total;
  for i in 1..n loop
    parts[i] := floor(total::numeric * p_weights[i] / w_sum)::bigint;
    rems[i] := (total::numeric * p_weights[i]) - parts[i]::numeric * w_sum;
    leftover := leftover - parts[i];
  end loop;
  while leftover > 0 loop
    best := 1;
    for i in 2..n loop
      if rems[i] > rems[best] then best := i; end if;
    end loop;
    parts[best] := parts[best] + 1;
    rems[best] := -1;          -- each part gets at most one leftover rupiah
    leftover := leftover - 1;
  end loop;
  if neg then
    for i in 1..n loop parts[i] := -parts[i]; end loop;
  end if;
  return parts;
end $$;

-- Estimated marketplace fee when the order source has none (TECH-SPEC §7.2):
-- fee_pct × (subtotal − order_discount) + fee_fixed, rounded half up to the rupiah.
create or replace function app.estimate_platform_fee(p_net bigint, p_fee_pct numeric, p_fee_fixed bigint)
returns bigint language sql immutable set search_path = '' as $$
  select case when p_fee_pct = 0 and p_fee_fixed = 0 then 0
              else round(p_net::numeric * p_fee_pct / 100)::bigint + p_fee_fixed end
$$;

-- Weighted average cost after receiving p_qty at p_unit_cost. Negative stock counts as 0.
create or replace function app.weighted_avg_cost(p_on_hand int, p_avg bigint, p_qty int, p_unit_cost bigint)
returns bigint language sql immutable set search_path = '' as $$
  select case when greatest(p_on_hand, 0) + p_qty <= 0 then p_unit_cost
              else round((greatest(p_on_hand, 0)::numeric * p_avg + p_qty::numeric * p_unit_cost)
                         / (greatest(p_on_hand, 0) + p_qty))::bigint end
$$;

create or replace function app.assert_member(p_tenant uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not app.is_member(p_tenant) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;
end $$;

-- ── stock_in (STK-0): purchase / restock ────────────────────────────────────
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
         avg_cost = app.weighted_avg_cost(variants.on_hand, variants.avg_cost, p_qty, p_unit_cost),
         cost_is_set = true
   where id = v.id
  returning variants.on_hand, variants.avg_cost;
end $$;

-- ── record_sale (POS-1/2/4): one atomic, idempotent sale ────────────────────
-- p_items: [{ "variant_id": uuid, "qty": int, "unit_price"?: bigint, "line_discount"?: bigint }]
create or replace function public.record_sale(
  p_tenant_id uuid,
  p_channel_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_order_discount bigint default 0,
  p_shipping_subsidy bigint default 0,
  p_payment_method text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_note text default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ch public.channels;
  v_sale_id uuid;
  v_customer_id uuid;
  v_existing record;
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_items jsonb;
  n int;
  i int;
  it jsonb;
  var public.variants;
  qtys int[] := '{}';
  prices bigint[] := '{}';
  ldisc bigint[] := '{}';
  gross bigint[] := '{}';
  costs bigint[] := '{}';
  cost_set boolean[] := '{}';
  vids uuid[] := '{}';
  names text[] := '{}';
  v_subtotal bigint := 0;
  v_fee bigint;
  a_disc bigint[];
  a_fee bigint[];
  a_ship bigint[];
  v_total bigint;
begin
  perform app.assert_member(p_tenant_id);
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'idempotency_key wajib' using errcode = '22023';
  end if;

  -- Idempotency (TECH-SPEC §3.3): the same key returns the sale already stored.
  select s.id, s.total into v_existing from public.sales s
   where s.tenant_id = p_tenant_id and s.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('sale_id', v_existing.id, 'total', v_existing.total, 'duplicate', true);
  end if;

  select * into ch from public.channels where id = p_channel_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Kanal tidak ditemukan' using errcode = 'P0002'; end if;

  -- Merge duplicate variant lines and lock variants in id order (no deadlocks).
  select jsonb_agg(x order by x->>'variant_id') into v_items
    from (select jsonb_build_object(
                   'variant_id', e->>'variant_id',
                   'qty', sum((e->>'qty')::int),
                   'unit_price', max(e->>'unit_price'),
                   'line_discount', sum(coalesce((e->>'line_discount')::bigint, 0))) as x
            from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
           group by e->>'variant_id') s;
  n := coalesce(jsonb_array_length(v_items), 0);
  if n = 0 then raise exception 'Keranjang masih kosong' using errcode = '22023'; end if;

  for i in 0..n - 1 loop
    it := v_items -> i;
    select * into var from public.variants
     where id = (it->>'variant_id')::uuid and tenant_id = p_tenant_id
     for update;
    if not found then raise exception 'Produk tidak ditemukan di toko ini' using errcode = 'P0002'; end if;
    if (it->>'qty')::int <= 0 then raise exception 'Jumlah harus lebih dari 0' using errcode = '22023'; end if;
    if var.on_hand < (it->>'qty')::int then
      raise exception 'Stok % tinggal %', coalesce((select p.name from public.products p where p.id = var.product_id), 'produk'), var.on_hand
        using errcode = 'P0001';
    end if;
    vids := vids || var.id;
    names := names || coalesce((select p.name || coalesce(' — ' || var.option_label, '') from public.products p where p.id = var.product_id), 'Produk');
    qtys := qtys || (it->>'qty')::int;
    prices := prices || coalesce((it->>'unit_price')::bigint, var.price);
    ldisc := ldisc || coalesce((it->>'line_discount')::bigint, 0);
    gross := gross || ((it->>'qty')::int * prices[i + 1] - ldisc[i + 1]);
    if gross[i + 1] < 0 then raise exception 'Diskon melebihi harga' using errcode = '22023'; end if;
    costs := costs || var.avg_cost;
    cost_set := cost_set || var.cost_is_set;
    v_subtotal := v_subtotal + gross[i + 1];
  end loop;

  if p_order_discount < 0 or p_order_discount > v_subtotal then
    raise exception 'Diskon transaksi tidak valid' using errcode = '22023';
  end if;
  if p_shipping_subsidy < 0 then raise exception 'Subsidi ongkir tidak valid' using errcode = '22023'; end if;

  v_fee := app.estimate_platform_fee(v_subtotal - p_order_discount, ch.fee_pct, ch.fee_fixed);
  v_total := v_subtotal - p_order_discount;
  a_disc := app.alloc_lr(p_order_discount, gross);
  a_fee := app.alloc_lr(v_fee, gross);
  a_ship := app.alloc_lr(p_shipping_subsidy, gross);

  -- CRM-1: customer by phone (already normalized to E.164 by the app).
  if nullif(trim(p_customer_phone), '') is not null then
    insert into public.customers (tenant_id, phone_e164, name, first_channel, created_at)
    values (p_tenant_id, trim(p_customer_phone), nullif(trim(p_customer_name), ''), ch.kind, v_when)
    on conflict (tenant_id, phone_e164) do update
      set name = coalesce(public.customers.name, excluded.name)
    returning id into v_customer_id;
  end if;

  begin
    insert into public.sales (tenant_id, channel_id, source, customer_id, subtotal, order_discount,
                              shipping_subsidy, platform_fee, platform_fee_estimated, total,
                              payment_method, note, occurred_at, idempotency_key, created_by)
    values (p_tenant_id, ch.id, case when ch.kind = 'pos' then 'pos' else 'manual' end::public.sale_source,
            v_customer_id, v_subtotal, p_order_discount, p_shipping_subsidy, v_fee, v_fee > 0, v_total,
            nullif(p_payment_method, ''), nullif(p_note, ''), v_when, p_idempotency_key, auth.uid())
    returning id into v_sale_id;
  exception when unique_violation then
    -- A concurrent request with the same key won the race.
    select s.id, s.total into v_existing from public.sales s
     where s.tenant_id = p_tenant_id and s.idempotency_key = p_idempotency_key;
    return jsonb_build_object('sale_id', v_existing.id, 'total', v_existing.total, 'duplicate', true);
  end;

  for i in 1..n loop
    insert into public.sale_items (tenant_id, sale_id, variant_id, name_snapshot, qty, unit_price, line_discount,
                                   unit_cost_snapshot, cost_is_set_snapshot,
                                   alloc_order_discount, alloc_platform_fee, alloc_shipping_subsidy)
    values (p_tenant_id, v_sale_id, vids[i], names[i], qtys[i], prices[i], ldisc[i],
            costs[i], cost_set[i], a_disc[i], a_fee[i], a_ship[i]);
    insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, ref_id, occurred_at, created_by)
    values (p_tenant_id, vids[i], -qtys[i], 'sale', costs[i], 'sale', v_sale_id, v_when, auth.uid());
    update public.variants set on_hand = on_hand - qtys[i] where id = vids[i];
  end loop;

  if v_customer_id is not null then
    update public.customers
       set total_spent = customers.total_spent + v_total,
           orders_count = customers.orders_count + 1,
           last_order_at = greatest(coalesce(customers.last_order_at, v_when), v_when)
     where id = v_customer_id;
  end if;

  return jsonb_build_object('sale_id', v_sale_id, 'total', v_total, 'platform_fee', v_fee, 'duplicate', false);
end $$;

revoke execute on function public.stock_in(uuid, int, bigint, text) from public, anon;
grant execute on function public.stock_in(uuid, int, bigint, text) to authenticated;
revoke execute on function public.record_sale(uuid, uuid, jsonb, text, bigint, bigint, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_sale(uuid, uuid, jsonb, text, bigint, bigint, text, text, text, text, timestamptz) to authenticated;
revoke execute on function app.assert_member(uuid) from public;
grant execute on function app.assert_member(uuid) to authenticated, service_role;
grant execute on function app.alloc_lr(bigint, bigint[]), app.estimate_platform_fee(bigint, numeric, bigint),
  app.weighted_avg_cost(int, bigint, int, bigint) to authenticated, service_role;
