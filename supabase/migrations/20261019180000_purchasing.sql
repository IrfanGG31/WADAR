-- Pembelian (ADR-005): suppliers, purchase orders, receiving and paying — Odoo's Purchase app at UMKM
-- size. An order is a plan (no stock, no money). Receiving it is the linking document: stock moves in
-- (stock_movements kind 'purchase', ref → the order) and the average cost updates exactly like
-- "Stok masuk". Paying is recorded per order. Autopilot drafts orders per supplier and may approve
-- them by itself only up to the owner's limit, which is enforced here, not in the app.

-- ── Suppliers ────────────────────────────────────────────────────────────────
create table public.suppliers (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  note text check (char_length(note) <= 300),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index suppliers_tenant_name_uidx on public.suppliers (tenant_id, lower(trim(name))) where archived_at is null;
create index suppliers_tenant_idx on public.suppliers (tenant_id);

-- What the shop last bought from whom, learned from receipts (no setup step for the owner).
create table public.supplier_products (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  last_unit_cost bigint not null check (last_unit_cost >= 0),
  last_bought_at timestamptz not null default now(),
  primary key (variant_id, supplier_id)
);
create index supplier_products_tenant_idx on public.supplier_products (tenant_id, variant_id, last_bought_at desc);
create index supplier_products_supplier_idx on public.supplier_products (supplier_id);

-- ── Document numbers: PO-2610-0001, per shop and month ──────────────────────
create table public.doc_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind ~ '^[A-Z]{2,4}$'),
  period text not null check (period ~ '^[0-9]{4}$'),
  last int not null check (last > 0),
  primary key (tenant_id, kind, period)
);
alter table public.doc_counters enable row level security;
revoke all on public.doc_counters from public, anon, authenticated;
grant all on public.doc_counters to service_role;

create or replace function app.next_doc_number(p_tenant uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_period text := to_char(now() at time zone coalesce((select timezone from public.tenants where id = p_tenant), 'Asia/Jakarta'), 'YYMM');
  v_n int;
begin
  insert into public.doc_counters as d (tenant_id, kind, period, last) values (p_tenant, p_kind, v_period, 1)
  on conflict (tenant_id, kind, period) do update set last = d.last + 1
  returning last into v_n;
  return p_kind || '-' || v_period || '-' || lpad(v_n::text, 4, '0');
end $$;
revoke execute on function app.next_doc_number(uuid, text) from public;

-- ── Purchase orders ─────────────────────────────────────────────────────────
create table public.purchase_orders (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  number text not null check (number ~ '^PO-[0-9]{4}-[0-9]{4,}$'),
  supplier_id uuid references public.suppliers (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'partial', 'received', 'canceled')),
  source text not null default 'manual' check (source in ('manual', 'autopilot')),
  -- Integer rupiah. total = Σ qty × unit_cost (what was ordered); received_total = Σ received qty × actual cost.
  total bigint not null default 0 check (total >= 0),
  received_total bigint not null default 0 check (received_total >= 0),
  paid_total bigint not null default 0 check (paid_total >= 0),
  note text check (char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  ordered_at timestamptz,
  received_at timestamptz,
  canceled_at timestamptz,
  unique (tenant_id, number)
);
create index purchase_orders_tenant_idx on public.purchase_orders (tenant_id, created_at desc);
create index purchase_orders_open_idx on public.purchase_orders (tenant_id, status) where status in ('draft', 'ordered', 'partial');
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

create table public.purchase_order_lines (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  variant_id uuid not null references public.variants (id),
  qty int not null check (qty between 1 and 1000000),
  unit_cost bigint not null check (unit_cost between 0 and 1000000000),
  received_qty int not null default 0 check (received_qty >= 0),
  unique (po_id, variant_id)
);
create index purchase_order_lines_variant_idx on public.purchase_order_lines (variant_id);
create index purchase_order_lines_tenant_idx on public.purchase_order_lines (tenant_id);

-- One "Terima barang" = one receipt (Odoo's stock.picking): the journal posts per receipt.
create table public.purchase_receipts (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  total bigint not null check (total >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index purchase_receipts_po_idx on public.purchase_receipts (po_id);

-- Payments to the supplier (append-only, like expenses).
create table public.purchase_payments (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null default 'transfer' check (char_length(method) between 1 and 40),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  created_by uuid,
  paid_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index purchase_payments_po_idx on public.purchase_payments (po_id);

-- ── RLS: everyone in the shop may see suppliers (receiving needs names); orders are for the owner
-- and the cashier (who receives goods). Every write goes through the functions below. ──
alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_payments enable row level security;
create policy member_select on public.suppliers for select to authenticated using (app.is_member(tenant_id));
create policy member_select on public.supplier_products for select to authenticated using (app.is_member(tenant_id));
create policy till_select on public.purchase_orders for select to authenticated using (app.has_shop_role(tenant_id, '{owner,cashier}'));
create policy till_select on public.purchase_order_lines for select to authenticated using (app.has_shop_role(tenant_id, '{owner,cashier}'));
create policy till_select on public.purchase_receipts for select to authenticated using (app.has_shop_role(tenant_id, '{owner,cashier}'));
create policy owner_select on public.purchase_payments for select to authenticated using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.suppliers, public.supplier_products, public.purchase_orders, public.purchase_order_lines,
  public.purchase_receipts, public.purchase_payments from public, anon, authenticated;
grant select on public.suppliers, public.supplier_products, public.purchase_orders, public.purchase_order_lines,
  public.purchase_receipts, public.purchase_payments to authenticated;
grant all on public.suppliers, public.supplier_products, public.purchase_orders, public.purchase_order_lines,
  public.purchase_receipts, public.purchase_payments to service_role;

-- A signed-in caller needs one of the roles; no JWT user = the server (service role: Autopilot cron).
-- anon cannot reach these functions at all (execute revoked below).
create or replace function app.assert_role_or_server(p_tenant uuid, p_roles public.member_role[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then perform app.assert_role(p_tenant, p_roles); end if;
end $$;
revoke execute on function app.assert_role_or_server(uuid, public.member_role[]) from public;

-- ── Suppliers: save / archive (owner) ───────────────────────────────────────
create or replace function public.save_supplier(p_tenant_id uuid, p_id uuid, p_name text, p_phone text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if p_id is null then
    insert into public.suppliers (tenant_id, name, phone_e164, note)
    values (p_tenant_id, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_note), ''))
    returning id into v_id;
  else
    update public.suppliers set name = trim(p_name), phone_e164 = nullif(trim(p_phone), ''), note = nullif(trim(p_note), '')
     where id = p_id and tenant_id = p_tenant_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Pemasok tidak ditemukan' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.archive_supplier(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.suppliers where id = p_id;
  if not found then raise exception 'Pemasok tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v_tenant, '{owner}');
  update public.suppliers set archived_at = coalesce(archived_at, now()) where id = p_id;
end $$;

-- ── Lines in: [{ "variant_id": uuid, "qty": int, "unit_cost": bigint }] → validated set ──
-- Duplicated variants are merged (qty summed, the last cost wins); every variant must be the shop's.
create or replace function app.purchase_lines(p_tenant uuid, p_lines jsonb)
returns table (variant_id uuid, qty int, unit_cost bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Pesanan pembelian minimal satu barang' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'Maksimal 100 barang per pesanan' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
     where (l ->> 'qty') is null or (l ->> 'qty')::int <= 0
        or (l ->> 'unit_cost') is null or (l ->> 'unit_cost')::bigint < 0
  ) then
    raise exception 'Jumlah harus lebih dari 0 dan harga modal tidak boleh minus' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
     where not exists (select 1 from public.variants v where v.id = (l ->> 'variant_id')::uuid and v.tenant_id = p_tenant)
  ) then
    raise exception 'Ada barang yang bukan milik toko ini' using errcode = '22023';
  end if;
  return query
  select (l ->> 'variant_id')::uuid, sum((l ->> 'qty')::int)::int,
         (array_agg((l ->> 'unit_cost')::bigint order by o desc))[1]
    from jsonb_array_elements(p_lines) with ordinality as e(l, o)
   group by (l ->> 'variant_id')::uuid;
end $$;
revoke execute on function app.purchase_lines(uuid, jsonb) from public;

create or replace function app.check_supplier(p_tenant uuid, p_supplier uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_supplier is not null and not exists (
    select 1 from public.suppliers where id = p_supplier and tenant_id = p_tenant and archived_at is null
  ) then
    raise exception 'Pemasok tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function app.check_supplier(uuid, uuid) from public;

-- ── Create / edit a draft (owner; Autopilot as the server) ─────────────────
create or replace function public.create_purchase_order(
  p_tenant_id uuid, p_supplier_id uuid, p_lines jsonb, p_note text default null, p_source text default 'manual'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_po public.purchase_orders;
begin
  perform app.assert_role_or_server(p_tenant_id, '{owner}');
  perform app.check_supplier(p_tenant_id, p_supplier_id);
  insert into public.purchase_orders (tenant_id, number, supplier_id, source, note, created_by)
  values (p_tenant_id, app.next_doc_number(p_tenant_id, 'PO'), p_supplier_id, coalesce(p_source, 'manual'), nullif(trim(p_note), ''), auth.uid())
  returning * into v_po;
  insert into public.purchase_order_lines (tenant_id, po_id, variant_id, qty, unit_cost)
  select p_tenant_id, v_po.id, l.variant_id, l.qty, l.unit_cost from app.purchase_lines(p_tenant_id, p_lines) l;
  update public.purchase_orders
     set total = (select coalesce(sum(qty::bigint * unit_cost), 0) from public.purchase_order_lines where po_id = v_po.id)
   where id = v_po.id
  returning * into v_po;
  perform app.audit(p_tenant_id, 'purchase.created', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_po.number, 'total', v_po.total, 'source', v_po.source));
  return jsonb_build_object('id', v_po.id, 'number', v_po.number, 'total', v_po.total);
end $$;

create or replace function public.update_purchase_order(p_po_id uuid, p_supplier_id uuid, p_lines jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v_po.tenant_id, '{owner}');
  if v_po.status <> 'draft' then raise exception 'Hanya draf yang bisa diubah' using errcode = '22023'; end if;
  perform app.check_supplier(v_po.tenant_id, p_supplier_id);
  -- Validate first (raises on a bad line), then replace the draft's lines with the new set.
  perform 1 from app.purchase_lines(v_po.tenant_id, p_lines);
  delete from public.purchase_order_lines
   where po_id = v_po.id and variant_id not in (select l.variant_id from app.purchase_lines(v_po.tenant_id, p_lines) l);
  insert into public.purchase_order_lines (tenant_id, po_id, variant_id, qty, unit_cost)
  select v_po.tenant_id, v_po.id, l.variant_id, l.qty, l.unit_cost from app.purchase_lines(v_po.tenant_id, p_lines) l
  on conflict (po_id, variant_id) do update set qty = excluded.qty, unit_cost = excluded.unit_cost;
  update public.purchase_orders
     set supplier_id = p_supplier_id, note = nullif(trim(p_note), ''),
         total = (select coalesce(sum(qty::bigint * unit_cost), 0) from public.purchase_order_lines where po_id = v_po.id)
   where id = v_po.id
  returning * into v_po;
  return jsonb_build_object('id', v_po.id, 'number', v_po.number, 'total', v_po.total);
end $$;

-- The Autopilot task "Setujui pesanan …" is done once the draft is approved or canceled.
create or replace function app.close_purchase_task(p_po public.purchase_orders) returns void
language sql security definer set search_path = '' as $$
  update public.agent_tasks set status = 'done', decided_at = now(), decided_by = auth.uid()
   where tenant_id = p_po.tenant_id and dedupe_key = 'po:' || p_po.id and status = 'open';
$$;
revoke execute on function app.close_purchase_task(public.purchase_orders) from public;

-- ── Approve ("Pesan"): draft → ordered. The owner always may; Autopilot (no user) only when the
-- order has a supplier and its total is within the shop's auto-approve limit. ──
create or replace function public.order_purchase_order(p_po_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_po public.purchase_orders; v_limit bigint;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002'; end if;
  if (select auth.uid()) is null then
    select coalesce(s.po_auto_limit, 0) into v_limit from public.agent_settings s where s.tenant_id = v_po.tenant_id;
    if v_po.supplier_id is null or coalesce(v_limit, 0) <= 0 or v_po.total > v_limit then
      raise exception 'Di atas batas setuju otomatis' using errcode = '42501';
    end if;
  else
    perform app.assert_role(v_po.tenant_id, '{owner}');
  end if;
  if v_po.status <> 'draft' then return; end if;
  update public.purchase_orders set status = 'ordered', ordered_at = now() where id = v_po.id;
  perform app.close_purchase_task(v_po);
  perform app.audit(v_po.tenant_id, 'purchase.ordered', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_po.number, 'total', v_po.total, 'by', case when auth.uid() is null then 'autopilot' else 'owner' end));
end $$;

create or replace function public.cancel_purchase_order(p_po_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v_po.tenant_id, '{owner}');
  if v_po.status not in ('draft', 'ordered') then
    raise exception 'Pesanan yang barangnya sudah diterima tidak bisa dibatalkan' using errcode = '22023';
  end if;
  update public.purchase_orders set status = 'canceled', canceled_at = now() where id = v_po.id;
  perform app.close_purchase_task(v_po);
  perform app.audit(v_po.tenant_id, 'purchase.canceled', 'purchase_order', v_po.id, jsonb_build_object('number', v_po.number));
end $$;

-- ── Receive goods (owner or cashier, like "Stok masuk"): lines [{ variant_id, qty, unit_cost? }].
-- Each line books a purchase movement linked to the order and updates the average cost; the order
-- becomes 'partial' or 'received'. The same idempotency key twice = one receipt. ──
create or replace function public.receive_purchase_order(p_po_id uuid, p_lines jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_po public.purchase_orders;
  v_existing public.purchase_receipts;
  v_receipt uuid;
  v_total bigint := 0;
  v_count int := 0;
  r record;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v_po.tenant_id, '{owner,cashier}');
  select * into v_existing from public.purchase_receipts where tenant_id = v_po.tenant_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('receipt_id', v_existing.id, 'total', v_existing.total, 'status', v_po.status, 'duplicate', true);
  end if;
  if v_po.status not in ('ordered', 'partial') then
    raise exception 'Pesanan ini belum dipesan atau sudah selesai' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Isi jumlah barang yang datang' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
     where not exists (select 1 from public.purchase_order_lines pl where pl.po_id = v_po.id and pl.variant_id = (l ->> 'variant_id')::uuid)
  ) then
    raise exception 'Ada barang yang tidak ada di pesanan ini' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l ->> 'qty')::int, 0) < 0) then
    raise exception 'Jumlah tidak boleh minus' using errcode = '22023';
  end if;

  insert into public.purchase_receipts (tenant_id, po_id, idempotency_key, total, created_by)
  values (v_po.tenant_id, v_po.id, p_idempotency_key, 0, auth.uid())
  returning id into v_receipt;

  for r in
    select pl.id as line_id, pl.variant_id, (l ->> 'qty')::int as qty,
           coalesce((l ->> 'unit_cost')::bigint, pl.unit_cost) as unit_cost
      from jsonb_array_elements(p_lines) l
      join public.purchase_order_lines pl on pl.po_id = v_po.id and pl.variant_id = (l ->> 'variant_id')::uuid
     where coalesce((l ->> 'qty')::int, 0) > 0
  loop
    if r.unit_cost < 0 then raise exception 'Harga modal tidak valid' using errcode = '22023'; end if;
    insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, ref_id, created_by)
    values (v_po.tenant_id, r.variant_id, r.qty, 'purchase', r.unit_cost, 'purchase_order', v_po.id, auth.uid());
    update public.variants
       set on_hand = on_hand + r.qty,
           avg_cost = case when cost_is_set then app.weighted_avg_cost(on_hand, avg_cost, r.qty, r.unit_cost) else r.unit_cost end,
           cost_is_set = cost_is_set or r.unit_cost > 0
     where id = r.variant_id;
    update public.purchase_order_lines set received_qty = received_qty + r.qty, unit_cost = r.unit_cost where id = r.line_id;
    if v_po.supplier_id is not null then
      insert into public.supplier_products (tenant_id, variant_id, supplier_id, last_unit_cost, last_bought_at)
      values (v_po.tenant_id, r.variant_id, v_po.supplier_id, r.unit_cost, now())
      on conflict (variant_id, supplier_id) do update set last_unit_cost = excluded.last_unit_cost, last_bought_at = now();
    end if;
    v_total := v_total + r.qty::bigint * r.unit_cost;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Isi jumlah barang yang datang' using errcode = '22023'; end if;

  update public.purchase_receipts set total = v_total where id = v_receipt;
  update public.purchase_orders po
     set received_total = po.received_total + v_total,
         total = (select coalesce(sum(qty::bigint * unit_cost), 0) from public.purchase_order_lines where po_id = po.id),
         status = case when exists (select 1 from public.purchase_order_lines where po_id = po.id and received_qty < qty)
                       then 'partial' else 'received' end,
         received_at = case when exists (select 1 from public.purchase_order_lines where po_id = po.id and received_qty < qty)
                            then po.received_at else now() end
   where po.id = v_po.id
  returning * into v_po;
  perform app.audit(v_po.tenant_id, 'purchase.received', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_po.number, 'receipt_total', v_total, 'status', v_po.status));
  return jsonb_build_object('receipt_id', v_receipt, 'total', v_total, 'status', v_po.status, 'duplicate', false);
end $$;

-- ── Pay the supplier (owner). Paying before the goods arrive is allowed (UMKM often transfer first). ──
create or replace function public.pay_purchase_order(p_po_id uuid, p_amount bigint, p_method text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_po public.purchase_orders; v_pay public.purchase_payments;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v_po.tenant_id, '{owner}');
  select * into v_pay from public.purchase_payments where tenant_id = v_po.tenant_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('payment_id', v_pay.id, 'paid_total', v_po.paid_total, 'duplicate', true); end if;
  if v_po.status in ('draft', 'canceled') then raise exception 'Setujui pesanan dulu sebelum membayar' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal bayar harus lebih dari 0' using errcode = '22023'; end if;
  insert into public.purchase_payments (tenant_id, po_id, amount, method, idempotency_key, created_by)
  values (v_po.tenant_id, v_po.id, p_amount, coalesce(nullif(trim(p_method), ''), 'transfer'), p_idempotency_key, auth.uid())
  returning * into v_pay;
  update public.purchase_orders set paid_total = paid_total + p_amount where id = v_po.id returning * into v_po;
  perform app.audit(v_po.tenant_id, 'purchase.paid', 'purchase_order', v_po.id,
    jsonb_build_object('number', v_po.number, 'amount', p_amount, 'method', v_pay.method));
  return jsonb_build_object('payment_id', v_pay.id, 'paid_total', v_po.paid_total, 'duplicate', false);
end $$;

revoke execute on function public.save_supplier(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.archive_supplier(uuid) from public, anon;
revoke execute on function public.create_purchase_order(uuid, uuid, jsonb, text, text) from public, anon;
revoke execute on function public.update_purchase_order(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.order_purchase_order(uuid) from public, anon;
revoke execute on function public.cancel_purchase_order(uuid) from public, anon;
revoke execute on function public.receive_purchase_order(uuid, jsonb, text) from public, anon;
revoke execute on function public.pay_purchase_order(uuid, bigint, text, text) from public, anon;
grant execute on function public.save_supplier(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.archive_supplier(uuid) to authenticated;
grant execute on function public.create_purchase_order(uuid, uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function public.update_purchase_order(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.order_purchase_order(uuid) to authenticated, service_role;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function public.pay_purchase_order(uuid, bigint, text, text) to authenticated;

-- ── Autopilot: draft orders by itself, approve by itself up to a limit (0 = never) ──
alter table public.agent_settings
  add column auto_po boolean not null default true,
  add column po_auto_limit bigint not null default 0 check (po_auto_limit between 0 and 1000000000);

create or replace function public.save_agent_purchase_settings(p_tenant_id uuid, p_auto_po boolean, p_po_auto_limit bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if p_po_auto_limit is null or p_po_auto_limit < 0 then raise exception 'Batas tidak valid' using errcode = '22023'; end if;
  insert into public.agent_settings as s (tenant_id, auto_po, po_auto_limit, updated_by)
  values (p_tenant_id, p_auto_po, p_po_auto_limit, auth.uid())
  on conflict (tenant_id) do update set auto_po = excluded.auto_po, po_auto_limit = excluded.po_auto_limit,
         updated_by = auth.uid(), updated_at = now();
  perform app.audit(p_tenant_id, 'agent.purchase_settings_saved', null, null,
    jsonb_build_object('auto_po', p_auto_po, 'po_auto_limit', p_po_auto_limit));
end $$;
revoke execute on function public.save_agent_purchase_settings(uuid, boolean, bigint) from public, anon;
grant execute on function public.save_agent_purchase_settings(uuid, boolean, bigint) to authenticated;
