-- U1: daily rollups `fin_daily_rollup` / `stock_daily_rollup` (TECH-SPEC §7.1/§7.2).
--
-- The dashboard still reads the live `fin_daily` view and `stock_daily_series`; these
-- tables freeze closed days so history/reporting does not have to walk every sale line.
-- Filled only by `rollup_daily` (service role; Vercel Cron /api/cron/daily-rollup at
-- 00.30 WIB — pg_cron is not needed for that). Idempotent: one call replaces the
-- (shop, day range) rows inside its transaction, so a re-run yields the same rows.
-- Members read their own shop's rows (RLS); nobody but the service role writes.

create table public.fin_daily_rollup (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  day date not null,
  variant_id uuid not null references public.variants (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  q int not null,
  revenue_gross bigint not null,
  line_discount bigint not null,
  order_discount_alloc bigint not null,
  cost bigint not null,
  platform_fee_alloc bigint not null,
  shipping_subsidy_alloc bigint not null,
  cost_is_set boolean not null,
  rolled_up_at timestamptz not null default now(),
  primary key (tenant_id, day, variant_id, channel_id)
);

-- closing = opening + stock_in - sold - stock_out_other (sale movements are always negative).
create table public.stock_daily_rollup (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  day date not null,
  variant_id uuid not null references public.variants (id) on delete cascade,
  opening int not null,
  stock_in int not null,
  sold int not null,
  stock_out_other int not null,
  closing int not null,
  rolled_up_at timestamptz not null default now(),
  primary key (tenant_id, day, variant_id)
);

alter table public.fin_daily_rollup enable row level security;
alter table public.stock_daily_rollup enable row level security;
create policy member_select on public.fin_daily_rollup for select to authenticated using (app.is_member(tenant_id));
create policy member_select on public.stock_daily_rollup for select to authenticated using (app.is_member(tenant_id));

revoke all on public.fin_daily_rollup, public.stock_daily_rollup from public, anon, authenticated;
grant select on public.fin_daily_rollup, public.stock_daily_rollup to authenticated;
grant all on public.fin_daily_rollup, public.stock_daily_rollup to service_role;

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
-- Supabase's default privileges grant EXECUTE to authenticated directly (not via public).
revoke execute on function public.rollup_daily(uuid, date, date) from anon, authenticated;
grant execute on function public.rollup_daily(uuid, date, date) to service_role;
