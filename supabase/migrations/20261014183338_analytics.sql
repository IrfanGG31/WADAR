-- D4 aggregates for src/core/stock.ts and src/core/finance.ts. Both run as the
-- caller (RLS applies) and return one row per variant / one jsonb document, so
-- the PostgREST row limit never truncates them. Days are in the shop time zone.

-- Per variant: daily units sold and opening stock for the last p_days days
-- (oldest first, the last element is today), plus what the forecast needs.
create or replace function public.stock_daily(p_tenant_id uuid, p_days int default 56)
returns table (
  variant_id uuid, product_id uuid, product_name text, option_label text, category text, unit text,
  price bigint, avg_cost bigint, cost_is_set boolean, on_hand int, min_stock int, lead_time_days int,
  pack_size int, sold int[], opening int[], last_sale_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_today date;
  v_from date;
begin
  perform app.assert_member(p_tenant_id);
  select t.timezone into v_tz from public.tenants t where t.id = p_tenant_id;
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - (greatest(p_days, 1) - 1);

  return query
  with vars as (
    select v.id, v.product_id, p.name, v.option_label, p.category, p.unit, v.price, v.avg_cost,
           v.cost_is_set, v.on_hand, v.min_stock, v.lead_time_days, v.pack_size
      from public.variants v
      join public.products p on p.id = v.product_id
     where v.tenant_id = p_tenant_id and p.deleted_at is null
  ), days as (
    select g::date as d from generate_series(v_from, v_today, interval '1 day') g
  ), mv as (
    select m.variant_id as vid, (m.occurred_at at time zone v_tz)::date as d,
           sum(case when m.kind = 'sale' then -m.qty else 0 end)::int as sold,
           sum(m.qty)::int as net
      from public.stock_movements m
     where m.tenant_id = p_tenant_id and m.occurred_at >= (v_from::timestamp at time zone v_tz)
     group by 1, 2
  ), grid as (
    select va.id as vid, dd.d, coalesce(mv.sold, 0) as sold,
           -- opening = stock now minus every movement from that day on
           (va.on_hand - sum(coalesce(mv.net, 0)) over (partition by va.id order by dd.d desc
                                                        rows between unbounded preceding and current row))::int as opening
      from vars va
     cross join days dd
      left join mv on mv.vid = va.id and mv.d = dd.d
  )
  select va.id, va.product_id, va.name, va.option_label, va.category, va.unit, va.price, va.avg_cost,
         va.cost_is_set, va.on_hand, va.min_stock, va.lead_time_days, va.pack_size,
         array_agg(g.sold order by g.d), array_agg(g.opening order by g.d),
         (select max(m.occurred_at) from public.stock_movements m where m.variant_id = va.id and m.kind = 'sale')
    from vars va
    join grid g on g.vid = va.id
   group by va.id, va.product_id, va.name, va.option_label, va.category, va.unit, va.price, va.avg_cost,
            va.cost_is_set, va.on_hand, va.min_stock, va.lead_time_days, va.pack_size
   order by va.name, va.option_label;
end $$;

-- Sales, expenses and new customers for the last p_days days as compact arrays:
--   lines:     [day, variant_id, channel_id, q, list, line_disc, order_disc, cost, fee, ship, missing_q, missing_r]
--              list = qty x unit_price; cost only where HPP is set; missing_* = lines without HPP
--   orders:    [day, channel_id, orders, total]
--   expenses:  [day, category, amount]
--   customers: [day, new_customers]
--   variants:  [variant_id, product_id, product_name, option_label, category]
--   channels:  [channel_id, kind, name, fee_pct, fee_fixed]
--   yesterday_until_now: {orders, total, items, customers} up to this time yesterday
create or replace function public.fin_summary(p_tenant_id uuid, p_days int default 35)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_today date;
  v_from date;
  v_start timestamptz;
begin
  perform app.assert_member(p_tenant_id);
  select t.timezone into v_tz from public.tenants t where t.id = p_tenant_id;
  v_today := (now() at time zone v_tz)::date;
  v_from := v_today - (greatest(p_days, 1) - 1);
  v_start := v_from::timestamp at time zone v_tz;

  return jsonb_build_object(
    'today', v_today,
    'from', v_from,
    'timezone', v_tz,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_array(x.d, x.variant_id, x.channel_id, x.q, x.list, x.line_disc, x.order_disc,
                                         x.cost, x.fee, x.ship, x.missing_q, x.missing_r) order by x.d)
        from (
          select (s.occurred_at at time zone v_tz)::date as d, si.variant_id, s.channel_id,
                 sum(si.qty)::int as q,
                 sum(si.qty * si.unit_price) as list,
                 sum(si.line_discount) as line_disc,
                 sum(si.alloc_order_discount) as order_disc,
                 sum(case when si.cost_is_set_snapshot then si.qty * si.unit_cost_snapshot else 0 end) as cost,
                 sum(si.alloc_platform_fee) as fee,
                 sum(si.alloc_shipping_subsidy) as ship,
                 sum(case when si.cost_is_set_snapshot then 0 else si.qty end)::int as missing_q,
                 sum(case when si.cost_is_set_snapshot then 0
                          else si.qty * si.unit_price - si.line_discount - si.alloc_order_discount end) as missing_r
            from public.sales s
            join public.sale_items si on si.sale_id = s.id
           where s.tenant_id = p_tenant_id and s.status = 'completed' and s.occurred_at >= v_start
           group by 1, 2, 3
        ) x), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_array(o.d, o.channel_id, o.n, o.total) order by o.d)
        from (
          select (s.occurred_at at time zone v_tz)::date as d, s.channel_id, count(*)::int as n, sum(s.total) as total
            from public.sales s
           where s.tenant_id = p_tenant_id and s.status = 'completed' and s.occurred_at >= v_start
           group by 1, 2
        ) o), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_array(e.d, e.category, e.amount) order by e.d)
        from (
          select x.occurred_at as d, x.category, sum(x.amount) as amount
            from public.expenses x
           where x.tenant_id = p_tenant_id and x.occurred_at >= v_from and x.occurred_at <= v_today
           group by 1, 2
        ) e), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_array(c.d, c.n) order by c.d)
        from (
          select (cu.created_at at time zone v_tz)::date as d, count(*)::int as n
            from public.customers cu
           where cu.tenant_id = p_tenant_id and cu.created_at >= v_start
           group by 1
        ) c), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_array(v.id, v.product_id, p.name, v.option_label, p.category))
        from public.variants v join public.products p on p.id = v.product_id
       where v.tenant_id = p_tenant_id), '[]'::jsonb),
    -- Today vs yesterday at the same time of day (Beranda cards).
    'yesterday_until_now', (
      select jsonb_build_object(
        'orders', count(*),
        'total', coalesce(sum(s.total), 0),
        'items', coalesce(sum((select sum(si.qty) from public.sale_items si where si.sale_id = s.id)), 0),
        'customers', (select count(*) from public.customers cu
                       where cu.tenant_id = p_tenant_id
                         and cu.created_at >= ((v_today - 1)::timestamp at time zone v_tz)
                         and cu.created_at < now() - interval '1 day'))
        from public.sales s
       where s.tenant_id = p_tenant_id and s.status = 'completed'
         and s.occurred_at >= ((v_today - 1)::timestamp at time zone v_tz)
         and s.occurred_at < now() - interval '1 day'),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_array(c.id, c.kind, c.name, c.fee_pct, c.fee_fixed))
        from public.channels c
       where c.tenant_id = p_tenant_id), '[]'::jsonb)
  );
end $$;

revoke execute on function public.stock_daily(uuid, int), public.fin_summary(uuid, int) from public, anon;
grant execute on function public.stock_daily(uuid, int), public.fin_summary(uuid, int) to authenticated;
