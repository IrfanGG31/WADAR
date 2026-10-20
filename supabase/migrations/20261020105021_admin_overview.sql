-- Panel admin: overview of every business on WADAR + shop list filtered by kind (real / demo).

create or replace function public.admin_overview()
returns table (real_shops bigint, real_active_7d bigint, real_new_7d bigint, demo_shops bigint,
               sales_30d bigint, revenue_30d bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
  select
    (select count(*) from public.tenants t where not t.is_demo),
    (select count(distinct s.tenant_id) from public.sales s join public.tenants t on t.id = s.tenant_id
      where not t.is_demo and s.occurred_at > now() - interval '7 days'),
    (select count(*) from public.tenants t where not t.is_demo and t.created_at > now() - interval '7 days'),
    (select count(*) from public.tenants t where t.is_demo and t.slug not like '%-arsip-%'),
    (select count(*) from public.sales s join public.tenants t on t.id = s.tenant_id
      where not t.is_demo and s.status <> 'void' and s.occurred_at > now() - interval '30 days'),
    (select coalesce(sum(s.total), 0)::bigint from public.sales s join public.tenants t on t.id = s.tenant_id
      where not t.is_demo and s.status <> 'void' and s.occurred_at > now() - interval '30 days');
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- p_kind: 'real' | 'demo' | anything else = all.
create or replace function public.admin_list_shops(p_query text, p_limit int, p_kind text)
returns table (id uuid, name text, slug text, is_demo boolean, demo_profile text, owner_email text,
               sales_30d bigint, revenue_30d bigint, last_sale_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
  select t.id, t.name, t.slug, t.is_demo, case when t.is_demo then app.demo_profile(t) end,
         (select u.email from public.memberships m join auth.users u on u.id = m.user_id
           where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1)::text,
         agg.cnt, agg.rev, agg.last_at, t.created_at
    from public.tenants t
    left join lateral (
      select count(*) as cnt, coalesce(sum(s.total), 0)::bigint as rev, max(s.occurred_at) as last_at
        from public.sales s
       where s.tenant_id = t.id and s.status <> 'void' and s.occurred_at > now() - interval '30 days') agg on true
   where t.slug not like '%-arsip-%'
     and (p_kind is distinct from 'real' or not t.is_demo)
     and (p_kind is distinct from 'demo' or t.is_demo)
     and (coalesce(trim(p_query), '') = '' or t.name ilike '%' || trim(p_query) || '%' or t.slug ilike '%' || trim(p_query) || '%')
   order by t.is_demo, agg.last_at desc nulls last, t.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;
revoke execute on function public.admin_list_shops(text, int, text) from public, anon;
grant execute on function public.admin_list_shops(text, int, text) to authenticated;
