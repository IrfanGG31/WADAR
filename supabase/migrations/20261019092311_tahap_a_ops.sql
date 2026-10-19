-- Tahap A (PRD §7.3, P0 gaps found in the 19 Okt review):
-- * POS-5 / SEC-2: audit log for void, price change, commission change, role change,
--   stock adjustment/opname, data export.
-- * STK-0 / STK-0b: stock adjustment (rusak, hilang, retur ke pemasok, koreksi) and
--   stock opname (physical count → difference), owner only, append-only movements.
-- * IMP-1..3: marketplace order import — one call per file, deduped on
--   (tenant, channel, external order number), import history.
-- * ONB-2: onboarding checklist can be dismissed per shop.
-- Expenses (FIN-1), channels & commissions (FIN-2), customer notes/tags (CRM-2) already
-- have the grants and policies they need; only the screens were missing.

-- ── Audit log ───────────────────────────────────────────────────────────────
create table public.audit_log (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_id uuid,
  action text not null check (char_length(action) between 3 and 60),
  entity text,
  entity_id uuid,
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_log_tenant_time_idx on public.audit_log (tenant_id, created_at desc);
alter table public.audit_log enable row level security;
create policy owner_select on public.audit_log for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

create or replace function app.audit(p_tenant uuid, p_action text, p_entity text, p_entity_id uuid, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, detail)
  values (p_tenant, (select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb));
$$;
revoke execute on function app.audit(uuid, text, text, uuid, jsonb) from public;

-- For actions that happen in the app (e.g. data export). Members only, fixed action list.
create or replace function public.log_audit(p_tenant_id uuid, p_action text, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_member(p_tenant_id);
  if p_action not in ('data.exported', 'report.exported') then
    raise exception 'action tidak dikenal' using errcode = '22023';
  end if;
  perform app.audit(p_tenant_id, p_action, null, null, p_detail);
end $$;
revoke execute on function public.log_audit(uuid, text, jsonb) from public, anon;
grant execute on function public.log_audit(uuid, text, jsonb) to authenticated;

create or replace function app.audit_sales_void() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'void' and new.status = 'void' then
    perform app.audit(new.tenant_id, 'sale.voided', 'sale', new.id,
      jsonb_build_object('total', new.total, 'reason', new.void_reason));
  end if;
  return new;
end $$;
create trigger audit_sales_void after update of status on public.sales
  for each row execute function app.audit_sales_void();

create or replace function app.audit_variant_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price is distinct from old.price then
    perform app.audit(new.tenant_id, 'product.price_changed', 'variant', new.id,
      jsonb_build_object('old', old.price, 'new', new.price));
  end if;
  return new;
end $$;
create trigger audit_variant_price after update of price on public.variants
  for each row execute function app.audit_variant_price();

create or replace function app.audit_channel_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.fee_pct is distinct from old.fee_pct or new.fee_fixed is distinct from old.fee_fixed then
    perform app.audit(new.tenant_id, 'channel.fee_changed', 'channel', new.id,
      jsonb_build_object('name', new.name, 'old_pct', old.fee_pct, 'new_pct', new.fee_pct,
                         'old_fixed', old.fee_fixed, 'new_fixed', new.fee_fixed));
  end if;
  return new;
end $$;
create trigger audit_channel_fee after update of fee_pct, fee_fixed on public.channels
  for each row execute function app.audit_channel_fee();

create or replace function app.audit_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform app.audit(new.tenant_id, 'member.role_changed', 'user', new.user_id,
      jsonb_build_object('old', old.role, 'new', new.role));
  elsif tg_op = 'DELETE' and exists (select 1 from public.tenants where id = old.tenant_id) then
    -- (a cascade from purging the shop itself is not a member removal)
    perform app.audit(old.tenant_id, 'member.removed', 'user', old.user_id, jsonb_build_object('role', old.role));
  end if;
  return coalesce(new, old);
end $$;
create trigger audit_membership after update of role or delete on public.memberships
  for each row execute function app.audit_membership();

-- ── STK-0: stock adjustment ─────────────────────────────────────────────────
-- Signed qty. Reasons: rusak, hilang, kedaluwarsa (out), retur_pemasok (out, kind 'return'),
-- ditemukan / koreksi (either way).
create or replace function public.adjust_stock(p_variant_id uuid, p_qty int, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.variants;
  v_kind public.movement_kind;
begin
  if p_qty is null or p_qty = 0 then raise exception 'Jumlah tidak boleh 0' using errcode = '22023'; end if;
  if p_reason not in ('rusak', 'hilang', 'kedaluwarsa', 'retur_pemasok', 'ditemukan', 'koreksi') then
    raise exception 'Alasan tidak dikenal' using errcode = '22023';
  end if;
  if p_reason in ('rusak', 'hilang', 'kedaluwarsa', 'retur_pemasok') and p_qty > 0 then
    raise exception 'Alasan ini mengurangi stok' using errcode = '22023';
  end if;
  if p_reason = 'ditemukan' and p_qty < 0 then raise exception 'Alasan ini menambah stok' using errcode = '22023'; end if;

  select * into v from public.variants where id = p_variant_id for update;
  if not found then raise exception 'Produk tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v.tenant_id, '{owner}');
  v_kind := case when p_reason = 'retur_pemasok' then 'return' else 'adjustment' end;

  insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, created_by)
  values (v.tenant_id, v.id, p_qty, v_kind, v.avg_cost, p_reason, auth.uid());
  update public.variants set on_hand = on_hand + p_qty where id = v.id;
  perform app.audit(v.tenant_id, 'stock.adjusted', 'variant', v.id,
    jsonb_build_object('qty', p_qty, 'reason', p_reason, 'note', nullif(trim(coalesce(p_note, '')), ''),
                       'before', v.on_hand, 'after', v.on_hand + p_qty));
  return jsonb_build_object('on_hand', v.on_hand + p_qty);
end $$;
revoke execute on function public.adjust_stock(uuid, int, text, text) from public, anon;
grant execute on function public.adjust_stock(uuid, int, text, text) to authenticated;

-- ── STK-0b: stock opname (physical count) ───────────────────────────────────
create or replace function public.stock_opname(p_variant_id uuid, p_counted int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.variants;
  v_diff int;
begin
  if p_counted is null or p_counted < 0 then raise exception 'Hasil hitung tidak valid' using errcode = '22023'; end if;
  select * into v from public.variants where id = p_variant_id for update;
  if not found then raise exception 'Produk tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v.tenant_id, '{owner}');
  v_diff := p_counted - v.on_hand;
  if v_diff <> 0 then
    insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, created_by)
    values (v.tenant_id, v.id, v_diff, 'opname', v.avg_cost, 'opname', auth.uid());
    update public.variants set on_hand = p_counted where id = v.id;
  end if;
  perform app.audit(v.tenant_id, 'stock.counted', 'variant', v.id,
    jsonb_build_object('system', v.on_hand, 'counted', p_counted, 'diff', v_diff,
                       'note', nullif(trim(coalesce(p_note, '')), '')));
  return jsonb_build_object('before', v.on_hand, 'counted', p_counted, 'diff', v_diff);
end $$;
revoke execute on function public.stock_opname(uuid, int, text) from public, anon;
grant execute on function public.stock_opname(uuid, int, text) to authenticated;

-- ── IMP-1..3: marketplace order import ──────────────────────────────────────
create table public.marketplace_imports (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel_id uuid not null references public.channels (id),
  marketplace text not null check (marketplace in ('shopee', 'tiktok_shop', 'tokopedia', 'other')),
  file_name text check (char_length(file_name) <= 200),
  orders_created int not null default 0,
  orders_duplicate int not null default 0,
  orders_canceled int not null default 0,
  orders_failed int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index marketplace_imports_tenant_time_idx on public.marketplace_imports (tenant_id, created_at desc);
alter table public.marketplace_imports enable row level security;
create policy member_select on public.marketplace_imports for select to authenticated using (app.is_member(tenant_id));
revoke all on public.marketplace_imports from public, anon, authenticated;
grant select on public.marketplace_imports to authenticated;
grant all on public.marketplace_imports to service_role;

-- p_orders: [{ external_order_id, occurred_at, status: completed|canceled|returned, buyer_name?,
--   order_discount?, shipping_subsidy?, platform_fee? (null = estimate from the channel rate),
--   items: [{ variant_id, qty, unit_price, line_discount? }] }]
-- Marketplace orders already happened, so stock may go below zero (shown as such on Stok).
-- Canceled / returned orders are stored with their status and move no stock.
create or replace function public.import_marketplace_orders(
  p_tenant_id uuid, p_channel_id uuid, p_marketplace text, p_file_name text, p_orders jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ch public.channels;
  o jsonb;
  it jsonb;
  v_ext text;
  v_status public.sale_status;
  v_when timestamptz;
  v_sale uuid;
  v_cust uuid;
  n int;
  i int;
  var public.variants;
  vids uuid[]; names text[]; qtys int[]; prices bigint[]; ldisc bigint[]; gross bigint[]; costs bigint[]; cset boolean[];
  v_sub bigint; v_disc bigint; v_ship bigint; v_fee bigint; v_est boolean;
  a_disc bigint[]; a_fee bigint[]; a_ship bigint[];
  c_created int := 0; c_dup int := 0; c_cancel int := 0; c_fail int := 0;
  errors jsonb := '[]';
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  select * into ch from public.channels where id = p_channel_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Kanal tidak ditemukan' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) > 2000 then
    raise exception 'Isi file tidak valid (maks. 2.000 pesanan per impor)' using errcode = '22023';
  end if;

  for o in select value from jsonb_array_elements(p_orders) loop
    v_ext := nullif(trim(o->>'external_order_id'), '');
    begin
      if v_ext is null then raise exception 'Nomor pesanan kosong' using errcode = '22023'; end if;
      if exists (select 1 from public.sales s where s.tenant_id = p_tenant_id and s.channel_id = ch.id
                   and s.external_order_id = v_ext) then
        c_dup := c_dup + 1;
        continue;
      end if;
      v_status := coalesce(nullif(o->>'status', ''), 'completed')::public.sale_status;
      if v_status not in ('completed', 'canceled', 'returned') then raise exception 'Status tidak dikenal'; end if;
      v_when := coalesce((o->>'occurred_at')::timestamptz, now());

      vids := '{}'; names := '{}'; qtys := '{}'; prices := '{}'; ldisc := '{}'; gross := '{}'; costs := '{}'; cset := '{}';
      v_sub := 0;
      n := coalesce(jsonb_array_length(o->'items'), 0);
      if n = 0 then raise exception 'Pesanan tanpa barang' using errcode = '22023'; end if;
      for i in 0..n - 1 loop
        it := o->'items'->i;
        select * into var from public.variants where id = (it->>'variant_id')::uuid and tenant_id = p_tenant_id for update;
        if not found then raise exception 'Produk belum dicocokkan' using errcode = 'P0002'; end if;
        if coalesce((it->>'qty')::int, 0) <= 0 then raise exception 'Jumlah barang tidak valid' using errcode = '22023'; end if;
        vids := vids || var.id;
        names := names || coalesce((select p.name || coalesce(' — ' || var.option_label, '') from public.products p
                                     where p.id = var.product_id), 'Produk');
        qtys := qtys || (it->>'qty')::int;
        prices := prices || greatest(0, coalesce((it->>'unit_price')::bigint, var.price));
        ldisc := ldisc || greatest(0, coalesce((it->>'line_discount')::bigint, 0));
        gross := gross || greatest(0, qtys[i + 1] * prices[i + 1] - ldisc[i + 1]);
        costs := costs || var.avg_cost;
        cset := cset || var.cost_is_set;
        v_sub := v_sub + gross[i + 1];
      end loop;

      v_disc := least(v_sub, greatest(0, coalesce((o->>'order_discount')::bigint, 0)));
      v_ship := greatest(0, coalesce((o->>'shipping_subsidy')::bigint, 0));
      v_est := (o->>'platform_fee') is null;
      v_fee := case when v_est then app.estimate_platform_fee(v_sub - v_disc, ch.fee_pct, ch.fee_fixed)
                    else greatest(0, (o->>'platform_fee')::bigint) end;
      a_disc := app.alloc_lr(v_disc, gross);
      a_fee := app.alloc_lr(v_fee, gross);
      a_ship := app.alloc_lr(v_ship, gross);

      v_cust := null;
      if nullif(trim(o->>'buyer_name'), '') is not null then
        select c.id into v_cust from public.customers c
         where c.tenant_id = p_tenant_id and c.phone_e164 is null and c.first_channel = ch.kind
           and lower(c.name) = lower(trim(o->>'buyer_name'))
         limit 1;
        if v_cust is null then
          insert into public.customers (tenant_id, name, first_channel, created_at)
          values (p_tenant_id, left(trim(o->>'buyer_name'), 120), ch.kind, v_when)
          returning id into v_cust;
        end if;
      end if;

      insert into public.sales (tenant_id, channel_id, source, external_order_id, customer_id, status, subtotal,
                                order_discount, shipping_subsidy, platform_fee, platform_fee_estimated, total,
                                payment_method, occurred_at, created_by)
      values (p_tenant_id, ch.id, 'import', v_ext, v_cust, v_status, v_sub, v_disc, v_ship, v_fee, v_est,
              v_sub - v_disc, 'marketplace', v_when, auth.uid())
      returning id into v_sale;

      for i in 1..n loop
        insert into public.sale_items (tenant_id, sale_id, variant_id, name_snapshot, qty, unit_price, line_discount,
                                       unit_cost_snapshot, cost_is_set_snapshot,
                                       alloc_order_discount, alloc_platform_fee, alloc_shipping_subsidy)
        values (p_tenant_id, v_sale, vids[i], names[i], qtys[i], prices[i], ldisc[i], costs[i], cset[i],
                a_disc[i], a_fee[i], a_ship[i]);
        if v_status = 'completed' then
          insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, ref_id, occurred_at, created_by)
          values (p_tenant_id, vids[i], -qtys[i], 'sale', costs[i], 'sale', v_sale, v_when, auth.uid());
          update public.variants set on_hand = on_hand - qtys[i] where id = vids[i];
        end if;
      end loop;

      if v_status = 'completed' then
        c_created := c_created + 1;
        if v_cust is not null then
          update public.customers
             set total_spent = customers.total_spent + (v_sub - v_disc),
                 orders_count = customers.orders_count + 1,
                 last_order_at = greatest(coalesce(customers.last_order_at, v_when), v_when)
           where id = v_cust;
        end if;
      else
        c_cancel := c_cancel + 1;
      end if;
    exception when others then
      c_fail := c_fail + 1;
      if jsonb_array_length(errors) < 50 then
        errors := errors || jsonb_build_object('order', coalesce(v_ext, '?'), 'error', sqlerrm);
      end if;
    end;
  end loop;

  insert into public.marketplace_imports (tenant_id, channel_id, marketplace, file_name, orders_created,
                                          orders_duplicate, orders_canceled, orders_failed, created_by)
  values (p_tenant_id, ch.id, coalesce(nullif(p_marketplace, ''), 'other'), left(p_file_name, 200),
          c_created, c_dup, c_cancel, c_fail, auth.uid());
  return jsonb_build_object('created', c_created, 'duplicate', c_dup, 'canceled', c_cancel,
                            'failed', c_fail, 'errors', errors);
end $$;
revoke execute on function public.import_marketplace_orders(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.import_marketplace_orders(uuid, uuid, text, text, jsonb) to authenticated;

-- ── ONB-2: dismissable onboarding checklist ─────────────────────────────────
alter table public.tenants add column onboarding_done_at timestamptz;
grant update (onboarding_done_at) on public.tenants to authenticated;

-- ── FIN-1: expenses stay append-only; a wrong entry is voided (owner), never edited ──
alter table public.expenses
  add column voided_at timestamptz,
  add column voided_by uuid,
  add column void_reason text check (char_length(void_reason) <= 200);

create or replace function public.void_expense(p_expense_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
begin
  select * into e from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Pengeluaran tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(e.tenant_id, '{owner}');
  if e.voided_at is not null then return jsonb_build_object('already', true); end if;
  update public.expenses
     set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = e.id;
  perform app.audit(e.tenant_id, 'expense.voided', 'expense', e.id,
    jsonb_build_object('amount', e.amount, 'category', e.category, 'reason', nullif(trim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('already', false);
end $$;
revoke execute on function public.void_expense(uuid, text) from public, anon;
grant execute on function public.void_expense(uuid, text) to authenticated;
