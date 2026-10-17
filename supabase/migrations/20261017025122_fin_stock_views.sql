-- D4 beranda / Stock Intelligence / Finance Insight — read-side helpers.
--
-- `fin_daily` (TECH-SPEC §7.2) is a plain view keyed by day × variant × channel;
-- the dashboard sums it instead of walking sale_items. `stock_daily_series`
-- returns an opening / sold pair per variant per day for the last N days so
-- `src/core/stock.ts` has exactly the shape it expects (§7.1 input).
--
-- Both read as the invoker, so the existing per-tenant RLS on sales / sale_items
-- / variants / stock_movements already restricts rows to the signed-in member.

create or replace view public.fin_daily
with (security_invoker = on) as
select
  si.tenant_id,
  ((s.occurred_at at time zone t.timezone)::date) as day,
  si.variant_id,
  s.channel_id,
  sum(si.qty)::int as q,
  sum(si.qty::bigint * si.unit_price)::bigint as revenue_gross,
  sum(si.line_discount)::bigint as line_discount,
  sum(si.alloc_order_discount)::bigint as order_discount_alloc,
  sum(si.qty::bigint * si.unit_cost_snapshot)::bigint as cost,
  sum(si.alloc_platform_fee)::bigint as platform_fee_alloc,
  sum(si.alloc_shipping_subsidy)::bigint as shipping_subsidy_alloc,
  bool_and(si.cost_is_set_snapshot) as cost_is_set
from public.sale_items si
join public.sales s on s.id = si.sale_id
join public.tenants t on t.id = si.tenant_id
where s.status = 'completed' and si.variant_id is not null
group by si.tenant_id, 2, si.variant_id, s.channel_id;

grant select on public.fin_daily to authenticated, service_role;

-- Beranda summary (BRD-1): today's four numbers + 7-day trend + the five
-- lowest-stock variants with their reorder suggestion. The trend is only
-- revenue aggregates (no per-product granularity), so the UI never computes
-- numbers from raw sale items.
create or replace function public.beranda_summary(p_tenant_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_today date;
  v_result jsonb;
begin
  perform app.assert_member(p_tenant_id);
  select timezone into v_tz from public.tenants where id = p_tenant_id;
  v_today := ((now() at time zone v_tz)::date);

  with sales_today as (
    select count(*)::int as orders,
           coalesce(sum(subtotal - order_discount), 0)::bigint as revenue
    from public.sales
    where tenant_id = p_tenant_id and status = 'completed'
      and ((occurred_at at time zone v_tz)::date) = v_today
  ),
  items_today as (
    select coalesce(sum(si.qty), 0)::int as items
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where si.tenant_id = p_tenant_id and s.status = 'completed'
      and ((s.occurred_at at time zone v_tz)::date) = v_today
  ),
  customers_today as (
    select count(*)::int as new_customers
    from public.customers
    where tenant_id = p_tenant_id
      and ((created_at at time zone v_tz)::date) = v_today
  ),
  trend as (
    select d.day,
           coalesce(sum(fd.revenue_gross - fd.line_discount - fd.order_discount_alloc), 0)::bigint as revenue,
           coalesce(sum(fd.q), 0)::int as q
    from generate_series(v_today - 6, v_today, interval '1 day') d(day)
    left join public.fin_daily fd
      on fd.tenant_id = p_tenant_id and fd.day = d.day::date
    group by d.day
    order by d.day
  )
  select jsonb_build_object(
    'today', v_today,
    'revenue_today', (select revenue from sales_today),
    'orders_today', (select orders from sales_today),
    'items_today', (select items from items_today),
    'new_customers_today', (select new_customers from customers_today),
    'trend_7d', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue, 'q', q)) from trend), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.beranda_summary(uuid) to authenticated, service_role;
