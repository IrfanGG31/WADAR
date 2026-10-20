-- Panel admin WADAR (PRD ADM-1, first slice): internal staff only.
-- * app.platform_admins: allowlist by email (app schema: not exposed to the API). Rows are
--   added by hand (SQL Editor / MCP), never from the app.
-- * public.demo_templates: name, owner, segment, tagline of each demo profile — what /juri
--   shows and what a new demo shop is created with. Public read (marketing copy), admin write.
-- * Every admin write goes through a security definer RPC that checks is_platform_admin()
--   and leaves a trail (app.admin_audit; a shop rename also lands in that shop's audit_log).

create table if not exists app.platform_admins (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  created_at timestamptz not null default now()
);

create table if not exists app.admin_audit (
  id uuid primary key default app.uuid_v7(),
  admin_id uuid not null,
  action text not null,
  target text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join app.platform_admins a on a.email = lower(u.email)
     where u.id = auth.uid() and not coalesce(u.is_anonymous, false))
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function app.assert_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Hanya admin WADAR' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_platform_admin() from public;

create table if not exists public.demo_templates (
  profile text primary key check (profile in ('warkop', 'penyetan', 'madura', 'kopi', 'skincare')),
  name text not null check (char_length(name) between 2 and 60),
  owner text not null check (char_length(owner) between 1 and 30),
  segment text not null check (char_length(segment) between 1 and 40),
  tagline text not null check (char_length(tagline) <= 160),
  emoji text not null default '🏪' check (char_length(emoji) between 1 and 8),
  on_juri boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
-- RLS with a read policy only: no insert/update/delete for anon or authenticated; writes go
-- through admin_save_demo_template (security definer).
alter table public.demo_templates enable row level security;
create policy demo_templates_read on public.demo_templates for select to anon, authenticated using (true);
grant select on public.demo_templates to anon, authenticated;

insert into public.demo_templates (profile, name, owner, segment, tagline, emoji, on_juri, sort) values
  ('warkop', 'Warkop Mas Bayu', 'Bayu', 'Cafe & warkop', 'Kopi Rp5.000, ratusan gelas sehari, buka sampai tengah malam.', '☕', true, 1),
  ('penyetan', 'Penyetan Bu Ratmi', 'Bu Ratmi', 'Warung makan', 'Ayam & lele penyet, ramai makan siang, GoFood sedang naik.', '🍗', true, 2),
  ('madura', 'Warung Madura Cak Mat', 'Cak Mat', 'Toko kelontong', 'Buka 24 jam, jualan eceran: rokok per batang, bensin per liter.', '🏪', true, 3),
  ('kopi', 'Kopi Dimas', 'Dimas', 'Coffee shop', 'Kedai kopi kekinian, 90 hari data, GoFood & WhatsApp.', '🧋', false, 4),
  ('skincare', 'Glow by Sari', 'Sari', 'Skincare online', 'Jualan di Shopee, TikTok Shop, dan WhatsApp; 90 hari data.', '✨', false, 5)
on conflict (profile) do nothing;

create or replace function public.admin_save_demo_template(
  p_profile text, p_name text, p_owner text, p_segment text, p_tagline text, p_emoji text, p_on_juri boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  update public.demo_templates
     set name = trim(p_name), owner = trim(p_owner), segment = trim(p_segment), tagline = trim(p_tagline),
         emoji = coalesce(nullif(trim(p_emoji), ''), emoji), on_juri = p_on_juri, updated_at = now()
   where profile = p_profile;
  if not found then raise exception 'Profil demo tidak dikenal' using errcode = '22023'; end if;
  insert into app.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'demo_template', p_profile, jsonb_build_object('name', trim(p_name), 'owner', trim(p_owner), 'on_juri', p_on_juri));
end $$;
revoke execute on function public.admin_save_demo_template(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_demo_template(text, text, text, text, text, text, boolean) to authenticated;

create or replace function public.admin_list_shops(p_query text default '', p_limit int default 50)
returns table (id uuid, name text, slug text, is_demo boolean, demo_profile text, owner_email text,
               sales_30d bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
  select t.id, t.name, t.slug, t.is_demo, case when t.is_demo then app.demo_profile(t) end,
         (select u.email from public.memberships m join auth.users u on u.id = m.user_id
           where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1)::text,
         (select count(*) from public.sales s where s.tenant_id = t.id and s.occurred_at > now() - interval '30 days'),
         t.created_at
    from public.tenants t
   where t.slug not like '%-arsip-%'
     and (coalesce(trim(p_query), '') = '' or t.name ilike '%' || trim(p_query) || '%' or t.slug ilike '%' || trim(p_query) || '%')
   order by t.is_demo, t.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;
revoke execute on function public.admin_list_shops(text, int) from public, anon;
grant execute on function public.admin_list_shops(text, int) to authenticated;

create or replace function public.admin_rename_shop(p_tenant_id uuid, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  perform app.assert_platform_admin();
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Nama toko 2–60 huruf' using errcode = '22023';
  end if;
  select name into v_old from public.tenants where id = p_tenant_id for update;
  if not found then raise exception 'Toko tidak ditemukan' using errcode = 'P0002'; end if;
  update public.tenants set name = trim(p_name) where id = p_tenant_id;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, detail)
  values (p_tenant_id, auth.uid(), 'admin_rename_shop', 'tenant', p_tenant_id, jsonb_build_object('from', v_old, 'to', trim(p_name)));
  insert into app.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'rename_shop', p_tenant_id::text, jsonb_build_object('from', v_old, 'to', trim(p_name)));
end $$;
revoke execute on function public.admin_rename_shop(uuid, text) from public, anon;
grant execute on function public.admin_rename_shop(uuid, text) to authenticated;

-- New demo shops take the name and the assistant's name from the template.
create or replace function app.new_demo_shop(p_owner uuid, p_profile text, p_slug text) returns public.tenants
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := app.demo_profile_valid(p_profile);
  v_tpl public.demo_templates;
  v_tenant public.tenants;
begin
  select * into v_tpl from public.demo_templates where profile = v_profile;
  v_tenant := app.create_tenant(
    p_owner,
    coalesce(v_tpl.name, case v_profile
      when 'kopi' then 'Kopi Dimas'
      when 'warkop' then 'Warkop Mas Bayu'
      when 'penyetan' then 'Penyetan Bu Ratmi'
      when 'madura' then 'Warung Madura Cak Mat'
      else 'Glow by Sari' end),
    p_slug,
    case v_profile when 'skincare' then 'kecantikan' when 'madura' then 'kelontong' else 'fnb' end,
    true);
  update public.tenants set demo_profile = v_profile where id = v_tenant.id returning * into v_tenant;
  if v_profile in ('kopi', 'skincare') then
    perform app.seed_demo(v_tenant.id, v_profile);
  else
    perform app.seed_demo_lite(v_tenant.id, v_profile);
  end if;
  if v_tpl.owner is not null then
    update public.store_profile set persona = jsonb_set(coalesce(persona, '{}'::jsonb), '{name}', to_jsonb(v_tpl.owner))
     where tenant_id = v_tenant.id;
  end if;
  return v_tenant;
end $$;
revoke execute on function app.new_demo_shop(uuid, text, text) from public;
