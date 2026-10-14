-- Entry points for demo shops (ONB-3, SPRINT-8D section 5). Nothing is ever deleted:
-- a reset builds a fresh demo shop and archives the old one (slug/name renamed), so
-- the old data stays until someone decides to drop it.

create or replace function app.demo_profile(p_tenant public.tenants) returns text
language sql immutable set search_path = '' as $$
  select case when p_tenant.business_type = 'fnb' then 'kopi' else 'skincare' end
$$;

-- Builds and seeds a demo shop owned by p_owner.
create or replace function app.new_demo_shop(p_owner uuid, p_profile text, p_slug text) returns public.tenants
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant public.tenants;
begin
  v_tenant := app.create_tenant(
    p_owner,
    case p_profile when 'kopi' then 'Kopi Dimas' else 'Glow by Sari' end,
    p_slug,
    case p_profile when 'kopi' then 'fnb' else 'kecantikan' end,
    true);
  perform app.seed_demo(v_tenant.id, p_profile);
  return v_tenant;
end $$;
revoke execute on function app.new_demo_shop(uuid, text, text) from public;

-- Moves an old demo shop out of the way (renamed, data kept).
create or replace function app.archive_demo_shop(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_suffix text := to_char(clock_timestamp(), 'YYMMDDHH24MISS');
begin
  update public.tenants
     set slug = left(slug, 24) || '-arsip-' || v_suffix,
         name = left(name, 64) || ' (arsip)'
   where id = p_tenant and is_demo;
end $$;
revoke execute on function app.archive_demo_shop(uuid) from public;

-- "Coba demo": a fresh demo shop for the signed-in (usually anonymous) user.
create or replace function public.create_demo_shop(p_profile text default 'skincare')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := case when p_profile = 'kopi' then 'kopi' else 'skincare' end;
  v_suffix text := substr(md5(random()::text || clock_timestamp()::text), 1, 5);
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return (app.new_demo_shop(auth.uid(), v_profile,
            case v_profile when 'kopi' then 'kopi-dimas-' else 'glow-by-sari-' end || v_suffix)).slug;
end $$;

-- Reset: a fresh copy with the same slug; the old shop is archived.
create or replace function public.reset_demo_shop(p_tenant_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
begin
  perform app.assert_member(p_tenant_id);
  select * into t from public.tenants where id = p_tenant_id;
  if not t.is_demo then raise exception 'Hanya toko demo yang bisa di-reset' using errcode = '42501'; end if;
  perform app.archive_demo_shop(t.id);
  return (app.new_demo_shop(auth.uid(), app.demo_profile(t), t.slug)).slug;
end $$;

-- pnpm seed:demo: (re)build the fixed-slug demo shops of a given owner (service role only).
create or replace function public.seed_demo_for_owner(p_owner uuid, p_reset boolean default true)
returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text;
  v_slug text;
  v_tenant public.tenants;
  v_out text[] := '{}';
begin
  foreach v_profile in array array['skincare', 'kopi'] loop
    v_slug := case v_profile when 'kopi' then 'kopi-dimas' else 'glow-by-sari' end;
    select * into v_tenant from public.tenants where slug = v_slug;
    if found and not v_tenant.is_demo then
      raise exception 'slug % belongs to a real shop', v_slug;
    end if;
    if found and not p_reset then
      insert into public.memberships (tenant_id, user_id, role) values (v_tenant.id, p_owner, 'owner')
        on conflict do nothing;
    else
      if found then perform app.archive_demo_shop(v_tenant.id); end if;
      perform app.new_demo_shop(p_owner, v_profile, v_slug);
    end if;
    v_out := v_out || v_slug;
  end loop;
  return v_out;
end $$;

revoke execute on function public.create_demo_shop(text) from public, anon;
grant execute on function public.create_demo_shop(text) to authenticated;
revoke execute on function public.reset_demo_shop(uuid) from public, anon;
grant execute on function public.reset_demo_shop(uuid) to authenticated;
revoke execute on function public.seed_demo_for_owner(uuid, boolean) from public, anon, authenticated;
grant execute on function public.seed_demo_for_owner(uuid, boolean) to service_role;
