-- TEAM-1: the owner invites staff by email, changes their role, revokes access.
-- No transactional email yet (Resend unverified): the owner copies the invite link
-- (/undangan/<token>) and sends it themselves. The invitee signs in with the invited
-- email and accepts; that creates their membership.
-- Every write goes through the security-definer functions below (owner only via
-- app.assert_role from 20261017070042_role_rls); memberships stay read-only for the app.

create table public.shop_invites (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  token text not null unique check (length(token) >= 32),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index shop_invites_tenant_idx on public.shop_invites (tenant_id, created_at desc);
-- One open invite per email and shop (a new invite revokes the old one).
create unique index shop_invites_open_email_idx on public.shop_invites (tenant_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.shop_invites enable row level security;
create policy owner_select on public.shop_invites for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.shop_invites from anon, authenticated;
grant select on public.shop_invites to authenticated;
grant all on public.shop_invites to service_role;

-- Two v4 UUIDs = 244 random bits, hex only (safe in a URL path).
create or replace function app.invite_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;
revoke execute on function app.invite_token() from public;

-- ── Owner: invite / revoke ──────────────────────────────────────────────────
create or replace function public.create_shop_invite(p_tenant_id uuid, p_email text, p_role public.member_role)
returns public.shop_invites
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite public.shop_invites;
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if p_role is null or p_role = 'owner' then
    raise exception 'invite a cashier or a chat admin' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
     where m.tenant_id = p_tenant_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;

  update public.shop_invites set revoked_at = now()
   where tenant_id = p_tenant_id and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.shop_invites (tenant_id, email, role, token, invited_by)
  values (p_tenant_id, v_email, p_role, app.invite_token(), auth.uid())
  returning * into v_invite;
  return v_invite;
end $$;

create or replace function public.revoke_shop_invite(p_tenant_id uuid, p_invite_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  update public.shop_invites set revoked_at = now()
   where id = p_invite_id and tenant_id = p_tenant_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
end $$;

-- ── Owner: members ──────────────────────────────────────────────────────────
-- Emails live in auth.users, which the app cannot read: owner-only definer listing.
create or replace function public.list_shop_members(p_tenant_id uuid)
returns table (user_id uuid, email text, role public.member_role, created_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  return query
  select m.user_id, u.email::text, m.role, m.created_at, m.user_id = auth.uid()
    from public.memberships m left join auth.users u on u.id = m.user_id
   where m.tenant_id = p_tenant_id
   order by (m.role = 'owner') desc, m.created_at;
end $$;

-- The caller is an owner and may not change or remove themselves, so a shop always keeps one.
create or replace function public.set_member_role(p_tenant_id uuid, p_user_id uuid, p_role public.member_role)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if p_user_id = auth.uid() then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;
  if p_role is null then raise exception 'role required' using errcode = '22023'; end if;
  update public.memberships set role = p_role where tenant_id = p_tenant_id and user_id = p_user_id;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.remove_shop_member(p_tenant_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if p_user_id = auth.uid() then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  delete from public.memberships where tenant_id = p_tenant_id and user_id = p_user_id;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
end $$;

-- ── Invitee: preview / accept ───────────────────────────────────────────────
-- status: open | expired | used | revoked. Nothing about the shop beyond its name.
create or replace function public.shop_invite_preview(p_token text)
returns table (shop_name text, role public.member_role, email text, status text)
language sql stable security definer set search_path = '' as $$
  select t.name, i.role, i.email,
         case when i.revoked_at is not null then 'revoked'
              when i.accepted_at is not null then 'used'
              when i.expires_at <= now() then 'expired'
              else 'open' end
    from public.shop_invites i join public.tenants t on t.id = i.tenant_id
   where i.token = p_token and (select auth.uid()) is not null
$$;

-- Only the invited email may accept. Already a member: the existing role stays.
create or replace function public.accept_shop_invite(p_token text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_invite public.shop_invites;
  v_slug text;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_invite from public.shop_invites where token = p_token for update;
  if not found or v_invite.revoked_at is not null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by = v_user then
      return (select slug from public.tenants where id = v_invite.tenant_id);
    end if;
    raise exception 'invite already used' using errcode = 'P0002';
  end if;
  if v_invite.expires_at <= now() then raise exception 'invite expired' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users u where u.id = v_user and lower(u.email) = v_invite.email) then
    raise exception 'invite is for another email' using errcode = '42501';
  end if;

  insert into public.memberships (tenant_id, user_id, role) values (v_invite.tenant_id, v_user, v_invite.role)
  on conflict (tenant_id, user_id) do nothing;
  update public.shop_invites set accepted_at = now(), accepted_by = v_user where id = v_invite.id;
  select slug into v_slug from public.tenants where id = v_invite.tenant_id;
  return v_slug;
end $$;

revoke execute on function public.create_shop_invite(uuid, text, public.member_role),
  public.revoke_shop_invite(uuid, uuid), public.list_shop_members(uuid),
  public.set_member_role(uuid, uuid, public.member_role), public.remove_shop_member(uuid, uuid),
  public.shop_invite_preview(text), public.accept_shop_invite(text) from public, anon;
grant execute on function public.create_shop_invite(uuid, text, public.member_role),
  public.revoke_shop_invite(uuid, uuid), public.list_shop_members(uuid),
  public.set_member_role(uuid, uuid, public.member_role), public.remove_shop_member(uuid, uuid),
  public.shop_invite_preview(text), public.accept_shop_invite(text) to authenticated;
