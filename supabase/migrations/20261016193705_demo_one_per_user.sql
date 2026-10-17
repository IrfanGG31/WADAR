-- Security review P5: "Coba demo" built a new 90-day demo shop on every call, without
-- limit. Now one active (not archived) demo shop per user and profile: "Coba demo" again
-- reopens it (no new seed; a fresh copy is "reset" in Pengaturan). So a user holds at
-- most two demo shops (skincare + kopi, both offered on the landing page). The per-IP
-- limit lives in the server action (src/app/demo-actions.ts).
create or replace function public.create_demo_shop(p_profile text default 'skincare')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := case when p_profile = 'kopi' then 'kopi' else 'skincare' end;
  v_suffix text := substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  v_existing public.tenants;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- One "Coba demo" at a time per user (double click, two tabs).
  perform pg_advisory_xact_lock(hashtextextended('create_demo_shop:' || auth.uid()::text, 0));

  select t.* into v_existing from public.tenants t
    join public.memberships m on m.tenant_id = t.id and m.user_id = auth.uid() and m.role = 'owner'
   where t.is_demo and t.slug not like '%-arsip-%' and app.demo_profile(t) = v_profile
   order by t.created_at desc
   limit 1;
  if found then
    return v_existing.slug;
  end if;

  return (app.new_demo_shop(auth.uid(), v_profile,
            case v_profile when 'kopi' then 'kopi-dimas-' else 'glow-by-sari-' end || v_suffix)).slug;
end $$;
revoke execute on function public.create_demo_shop(text) from public, anon;
grant execute on function public.create_demo_shop(text) to authenticated;
