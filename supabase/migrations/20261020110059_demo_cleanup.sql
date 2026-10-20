-- Demo shops pile up: every "Coba demo" / /juri visitor (an anonymous user) gets a copy that
-- nobody deletes. A demo shop is disposable when it is older than the cutoff and no member is
-- a real (non-anonymous) account — demo shops of staff/owners are kept. Deleting the tenant
-- cascades to its data, like purge_due_shops.

create or replace function app.purge_stale_demo_shops(p_older_than interval)
returns int
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.tenants t
     where t.is_demo
       and t.created_at <= now() - p_older_than
       and not exists (
         select 1 from public.memberships m join auth.users u on u.id = m.user_id
          where m.tenant_id = t.id and not coalesce(u.is_anonymous, false))
    returning 1)
  select count(*)::int from gone
$$;
revoke execute on function app.purge_stale_demo_shops(interval) from public;

-- Daily cron (service role): visitor demo shops older than 7 days.
create or replace function public.purge_stale_demo_shops()
returns int
language sql security definer set search_path = '' as $$
  select app.purge_stale_demo_shops(interval '7 days')
$$;
revoke execute on function public.purge_stale_demo_shops() from public, anon, authenticated;
grant execute on function public.purge_stale_demo_shops() to service_role;

-- Panel admin: clean up now, visitor demo shops older than p_days (0 = all of them).
create or replace function public.admin_purge_demo_shops(p_days int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform app.assert_platform_admin();
  n := app.purge_stale_demo_shops(make_interval(days => greatest(0, least(coalesce(p_days, 7), 365))));
  insert into app.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'purge_demo_shops', null, jsonb_build_object('older_than_days', p_days, 'deleted', n));
  return n;
end $$;
revoke execute on function public.admin_purge_demo_shops(int) from public, anon;
grant execute on function public.admin_purge_demo_shops(int) to authenticated;

-- Panel admin: demo shops per profile (instead of one row per visitor copy).
create or replace function public.admin_demo_summary()
returns table (profile text, shops bigint, visitor_shops bigint, last_created timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
  select app.demo_profile(t), count(*),
         count(*) filter (where not exists (
           select 1 from public.memberships m join auth.users u on u.id = m.user_id
            where m.tenant_id = t.id and not coalesce(u.is_anonymous, false))),
         max(t.created_at)
    from public.tenants t
   where t.is_demo and t.slug not like '%-arsip-%'
   group by 1
   order by 2 desc;
end $$;
revoke execute on function public.admin_demo_summary() from public, anon;
grant execute on function public.admin_demo_summary() to authenticated;
