-- POS-5: void a wrongly entered sale (owner or service role only).
--
-- Sales stay append-only: the row is kept, only `status` flips to 'void' (+ who/when/why).
-- Stock comes back through new `stock_movements` rows (kind 'void', ref = the sale), so
-- `on_hand = Σ stock_movements` still holds. Finance already counts completed sales only
-- (`fin_daily`, `beranda_summary`, and `rollup_daily` reads `fin_daily`). Stock history
-- treats a voided sale and its void movement as if neither happened: both are dropped from
-- `stock_daily_series` and `rollup_daily`, so demand forecasts do not see the mistaken sale.

alter table public.sales
  add column voided_at timestamptz,
  add column voided_by uuid,
  add column void_reason text check (void_reason is null or length(void_reason) <= 200);

-- Movements of voided sales (the original 'sale' rows and their 'void' returns).
create or replace function app.is_voided_sale_movement(p_ref_type text, p_ref_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select p_ref_type = 'sale' and p_ref_id is not null
     and exists (select 1 from public.sales s where s.id = p_ref_id and s.status = 'void')
$$;
grant execute on function app.is_voided_sale_movement(text, uuid) to authenticated, service_role;

create or replace function public.void_sale(p_sale_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sales;
  it record;
  v_tz text;
  v_from date;
  v_to date;
  v_restocked int := 0;
begin
  select * into s from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan' using errcode = 'P0002'; end if;
  -- No JWT user = service role / scripts. Signed-in users must own the shop (cashiers cannot void).
  if (select auth.uid()) is not null then
    perform app.assert_role(s.tenant_id, '{owner}');
  end if;
  if length(coalesce(p_reason, '')) > 200 then
    raise exception 'Alasan pembatalan maksimal 200 karakter' using errcode = '22023';
  end if;

  if s.status = 'void' then
    return jsonb_build_object('sale_id', s.id, 'already_void', true, 'restocked', 0);
  end if;
  if s.status <> 'completed' then
    raise exception 'Transaksi ini tidak bisa dibatalkan' using errcode = '55000';
  end if;

  update public.sales
     set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = nullif(trim(p_reason), '')
   where id = s.id;

  -- Return every line to stock; variants locked in id order (same order as record_sale).
  for it in
    select si.variant_id, sum(si.qty)::int as qty, max(si.unit_cost_snapshot) as unit_cost
      from public.sale_items si
     where si.sale_id = s.id and si.variant_id is not null
     group by si.variant_id
     order by si.variant_id
  loop
    perform 1 from public.variants where id = it.variant_id for update;
    insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost, ref_type, ref_id, created_by)
    values (s.tenant_id, it.variant_id, it.qty, 'void', it.unit_cost, 'sale', s.id, auth.uid());
    -- avg_cost unchanged: the goods come back at the shop's current average cost.
    update public.variants set on_hand = on_hand + it.qty where id = it.variant_id;
    v_restocked := v_restocked + it.qty;
  end loop;

  if s.customer_id is not null then
    update public.customers c
       set total_spent = greatest(c.total_spent - s.total, 0),
           orders_count = greatest(c.orders_count - 1, 0),
           last_order_at = (select max(x.occurred_at) from public.sales x
                             where x.customer_id = c.id and x.status = 'completed')
     where c.id = s.customer_id;
  end if;

  -- Days already frozen in the rollups (sale day … yesterday) are rebuilt so reports drop the sale now.
  select timezone into v_tz from public.tenants where id = s.tenant_id;
  v_from := (s.occurred_at at time zone v_tz)::date;
  v_to := least((now() at time zone v_tz)::date - 1, v_from + 92);
  if v_from <= v_to and (
       exists (select 1 from public.fin_daily_rollup r where r.tenant_id = s.tenant_id and r.day between v_from and v_to)
    or exists (select 1 from public.stock_daily_rollup r where r.tenant_id = s.tenant_id and r.day between v_from and v_to)) then
    perform public.rollup_daily(s.tenant_id, v_from, v_to);
  end if;

  return jsonb_build_object('sale_id', s.id, 'already_void', false, 'restocked', v_restocked);
end $$;

revoke execute on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated, service_role;

-- Same function as 20261017120100 (service-role guard kept), minus voided-sale movements.
create or replace function public.stock_daily_series(p_tenant_id uuid, p_days int default 56)
returns table (variant_id uuid, day date, opening int, sold int)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_today date;
begin
  if current_user <> 'service_role' then
    perform app.assert_member(p_tenant_id);
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant_id;
  if v_tz is null then raise exception 'Toko tidak ditemukan' using errcode = 'P0002'; end if;
  v_today := ((now() at time zone v_tz)::date);

  return query
  with
    days as (
      select (v_today - gs)::date as d
      from generate_series(greatest(p_days, 1) - 1, 0, -1) gs
    ),
    vrows as (
      select v.id, v.on_hand as cur_on_hand from public.variants v where v.tenant_id = p_tenant_id
    ),
    mov as (
      select m.variant_id,
             ((m.occurred_at at time zone v_tz)::date) as mday,
             m.qty, m.kind
      from public.stock_movements m
      where m.tenant_id = p_tenant_id
        and not app.is_voided_sale_movement(m.ref_type, m.ref_id)
    ),
    net_from as (
      -- net qty with occurred_at::date >= d
      select vr.id as variant_id, d.d,
             coalesce((select sum(mv.qty) from mov mv where mv.variant_id = vr.id and mv.mday >= d.d), 0) as net_after,
             coalesce((select -sum(mv.qty) from mov mv
                        where mv.variant_id = vr.id and mv.mday = d.d and mv.kind = 'sale'), 0) as sold
      from vrows vr cross join days d
    )
  select nf.variant_id,
         nf.d as day,
         (vr.cur_on_hand - nf.net_after)::int as opening,
         nf.sold::int as sold
  from net_from nf
  join vrows vr on vr.id = nf.variant_id
  order by nf.variant_id, nf.d;
end $$;

grant execute on function public.stock_daily_series(uuid, int) to authenticated, service_role;

-- Same function as 20261017140000, minus voided-sale movements in the stock walk-back.
-- (A voided sale and its return net to zero, so on_hand-based closing stays exact.)
create or replace function public.rollup_daily(p_tenant_id uuid, p_from date, p_to date)
returns table (fin_rows int, stock_rows int)
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text;
  v_fin int;
  v_stock int;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception 'Rentang tanggal rollup tidak valid' using errcode = '22023';
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant_id;
  if v_tz is null then raise exception 'Toko tidak ditemukan' using errcode = 'P0002'; end if;

  -- Same rows as the live view for those days (completed sales only, shop-local day).
  delete from public.fin_daily_rollup r where r.tenant_id = p_tenant_id and r.day between p_from and p_to;
  insert into public.fin_daily_rollup (tenant_id, day, variant_id, channel_id, q, revenue_gross, line_discount,
                                       order_discount_alloc, cost, platform_fee_alloc, shipping_subsidy_alloc, cost_is_set)
  select f.tenant_id, f.day, f.variant_id, f.channel_id, f.q, f.revenue_gross, f.line_discount,
         f.order_discount_alloc, f.cost, f.platform_fee_alloc, f.shipping_subsidy_alloc, f.cost_is_set
  from public.fin_daily f
  where f.tenant_id = p_tenant_id and f.day between p_from and p_to;
  get diagnostics v_fin = row_count;

  -- Stock walks back from on_hand (= Σ movements) like stock_daily_series:
  -- closing(d) = on_hand - Σ movements after d; opening(d) = closing(d) - Σ movements on d.
  delete from public.stock_daily_rollup r where r.tenant_id = p_tenant_id and r.day between p_from and p_to;
  with
    days as (select gs::date as d from generate_series(p_from, p_to, interval '1 day') gs),
    mov as (
      select m.variant_id, ((m.occurred_at at time zone v_tz)::date) as mday, m.qty, m.kind
      from public.stock_movements m
      where m.tenant_id = p_tenant_id and m.occurred_at >= (p_from::timestamp at time zone v_tz)
        and not app.is_voided_sale_movement(m.ref_type, m.ref_id)
    )
  insert into public.stock_daily_rollup (tenant_id, day, variant_id, opening, stock_in, sold, stock_out_other, closing)
  select p_tenant_id, d.d, v.id,
         (v.on_hand - coalesce(aft.net, 0) - coalesce(dm.net, 0))::int,
         coalesce(dm.qty_in, 0)::int,
         coalesce(dm.sold, 0)::int,
         coalesce(dm.out_other, 0)::int,
         (v.on_hand - coalesce(aft.net, 0))::int
  from public.variants v
  cross join days d
  left join lateral (
    select sum(mv.qty) as net,
           sum(mv.qty) filter (where mv.qty > 0) as qty_in,
           -sum(mv.qty) filter (where mv.kind = 'sale') as sold,
           -sum(mv.qty) filter (where mv.qty < 0 and mv.kind <> 'sale') as out_other
    from mov mv where mv.variant_id = v.id and mv.mday = d.d
  ) dm on true
  left join lateral (select sum(mv.qty) as net from mov mv where mv.variant_id = v.id and mv.mday > d.d) aft on true
  where v.tenant_id = p_tenant_id
    and ((v.created_at at time zone v_tz)::date) <= d.d;
  get diagnostics v_stock = row_count;

  return query select v_fin, v_stock;
end $$;

revoke execute on function public.rollup_daily(uuid, date, date) from public;
revoke execute on function public.rollup_daily(uuid, date, date) from anon, authenticated;
grant execute on function public.rollup_daily(uuid, date, date) to service_role;
