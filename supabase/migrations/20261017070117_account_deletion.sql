-- GAP #6 (sisa): a signed-in user deletes their own account's app data.
--
-- `delete_my_account` removes the caller's memberships, push devices and open invites
-- addressed to them, and deletes demo shops only they own. It refuses — touching nothing —
-- while the caller is the last owner of a real shop (delete the shop first or make another
-- member owner). The `auth.users` row stays: deleting it needs the Auth admin API (service
-- role), so the request is queued in `account_deletions` for that later step.

create table public.account_deletions (
  user_id uuid primary key,              -- no FK: the row must outlive auth.users
  requested_at timestamptz not null default now(),
  auth_deleted_at timestamptz
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public, anon, authenticated;
grant all on public.account_deletions to service_role;

-- p_confirm = the account's email (case-insensitive), or 'HAPUS' for accounts without one
-- (anonymous demo sessions). Returns { deleted, blocked_shops: [{slug, name}], left_shops, deleted_demo_shops }.
create or replace function public.delete_my_account(p_confirm text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_blocked jsonb;
  v_demo int;
  v_left int;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if lower(trim(coalesce(p_confirm, ''))) <> coalesce(nullif(v_email, ''), 'hapus') then
    raise exception 'Konfirmasi tidak cocok' using errcode = '22023';
  end if;

  -- Lock the memberships of every shop the caller belongs to, so a concurrent owner
  -- change cannot leave a shop without one.
  perform 1 from public.memberships m
   where m.tenant_id in (select x.tenant_id from public.memberships x where x.user_id = v_uid)
   for update;

  select coalesce(jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name) order by t.name), '[]'::jsonb)
    into v_blocked
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = v_uid and m.role = 'owner' and not t.is_demo
     and not exists (select 1 from public.memberships o
                      where o.tenant_id = m.tenant_id and o.role = 'owner' and o.user_id <> v_uid);
  if jsonb_array_length(v_blocked) > 0 then
    return jsonb_build_object('deleted', false, 'blocked_shops', v_blocked, 'left_shops', 0, 'deleted_demo_shops', 0);
  end if;

  -- Demo shops (incl. archived resets) only this user owns go with the account; every tenant table cascades.
  with gone as (
    delete from public.tenants t
     where t.is_demo
       and exists (select 1 from public.memberships m where m.tenant_id = t.id and m.user_id = v_uid and m.role = 'owner')
       and not exists (select 1 from public.memberships o where o.tenant_id = t.id and o.role = 'owner' and o.user_id <> v_uid)
    returning 1)
  select count(*) into v_demo from gone;

  delete from public.push_subscriptions where user_id = v_uid;
  if v_email is not null then
    delete from public.shop_invites where email = v_email and accepted_at is null;
  end if;
  delete from public.memberships where user_id = v_uid;
  get diagnostics v_left = row_count;

  insert into public.account_deletions (user_id) values (v_uid)
  on conflict (user_id) do update set requested_at = now();

  return jsonb_build_object('deleted', true, 'blocked_shops', '[]'::jsonb, 'left_shops', v_left, 'deleted_demo_shops', v_demo);
end $$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
