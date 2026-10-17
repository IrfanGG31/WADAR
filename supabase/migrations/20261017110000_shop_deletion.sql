-- GAP #6 — hapus toko bertahap (PDF §C.3 Tabel 10 "bisa diekspor/dihapus", UU PDP 27/2022).
-- Stage 1 `request_shop_deletion`: the shop is closed for buyers (widget) and scheduled
--   for purge after 7 days; the owner can still export or cancel.
-- Stage 2 `purge_shop` (owner, now) or `purge_due_shops` (service role, after the grace
--   period): deletes the tenant row; every tenant table cascades (on delete cascade).
-- Owner only (role 'owner'), and the owner types the slug to confirm.

alter table public.tenants
  add column deletion_requested_at timestamptz,
  add column purge_after timestamptz,
  add constraint tenants_deletion_pair check ((deletion_requested_at is null) = (purge_after is null));
create index tenants_purge_after_idx on public.tenants (purge_after) where purge_after is not null;

-- The deletion columns change only through the functions below.
revoke update on public.tenants from authenticated;
grant update (name, business_type, timezone) on public.tenants to authenticated;

create or replace function app.assert_owner(p_tenant uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception 'only the shop owner' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_owner(uuid) from public;

create or replace function app.assert_confirm_slug(p_tenant uuid, p_confirm_slug text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant and t.slug = lower(trim(coalesce(p_confirm_slug, '')))) then
    raise exception 'confirmation slug does not match' using errcode = '22023';
  end if;
end $$;
revoke execute on function app.assert_confirm_slug(uuid, text) from public;

create or replace function public.request_shop_deletion(p_tenant_id uuid, p_confirm_slug text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_purge timestamptz;
begin
  perform app.assert_owner(p_tenant_id);
  perform app.assert_confirm_slug(p_tenant_id, p_confirm_slug);
  update public.tenants
     set deletion_requested_at = coalesce(deletion_requested_at, now()),
         purge_after = coalesce(purge_after, now() + interval '7 days')
   where id = p_tenant_id
  returning purge_after into v_purge;
  return v_purge;
end $$;

create or replace function public.cancel_shop_deletion(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_owner(p_tenant_id);
  update public.tenants set deletion_requested_at = null, purge_after = null where id = p_tenant_id;
end $$;

create or replace function public.purge_shop(p_tenant_id uuid, p_confirm_slug text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_owner(p_tenant_id);
  perform app.assert_confirm_slug(p_tenant_id, p_confirm_slug);
  if not exists (select 1 from public.tenants where id = p_tenant_id and deletion_requested_at is not null) then
    raise exception 'schedule the deletion first' using errcode = '55000';
  end if;
  delete from public.tenants where id = p_tenant_id;
end $$;

-- Daily job (Vercel Cron / pg_cron, service role): purge shops past their grace period.
create or replace function public.purge_due_shops()
returns int
language sql security definer set search_path = '' as $$
  with gone as (delete from public.tenants where purge_after <= now() returning 1)
  select count(*)::int from gone
$$;

revoke execute on function public.request_shop_deletion(uuid, text), public.cancel_shop_deletion(uuid),
  public.purge_shop(uuid, text), public.purge_due_shops() from public, anon;
grant execute on function public.request_shop_deletion(uuid, text), public.cancel_shop_deletion(uuid),
  public.purge_shop(uuid, text) to authenticated;
grant execute on function public.purge_due_shops() to service_role;
