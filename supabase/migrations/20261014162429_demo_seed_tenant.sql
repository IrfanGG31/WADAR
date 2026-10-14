-- Shared tenant bootstrap used by create_shop and the demo shops.
create or replace function app.create_tenant(p_owner uuid, p_name text, p_slug text, p_business_type text, p_is_demo boolean)
returns public.tenants
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant public.tenants;
begin
  insert into public.tenants (name, slug, business_type, is_demo)
  values (trim(p_name), lower(trim(p_slug)), nullif(trim(p_business_type), ''), p_is_demo)
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, role) values (v_tenant.id, p_owner, 'owner');

  -- Default commissions are estimates (FIN-2: "perkiraan, cek di akun sellermu").
  insert into public.channels (tenant_id, kind, name, fee_pct, fee_fixed) values
    (v_tenant.id, 'pos', 'Kasir (offline)', 0, 0),
    (v_tenant.id, 'whatsapp', 'WhatsApp', 0, 0),
    (v_tenant.id, 'shopee', 'Shopee', 12, 1250),
    (v_tenant.id, 'tiktok_shop', 'TikTok Shop', 15, 1000),
    (v_tenant.id, 'gofood', 'GoFood', 20, 0);

  insert into public.store_profile (tenant_id) values (v_tenant.id);
  return v_tenant;
end $$;
revoke execute on function app.create_tenant(uuid, text, text, text, boolean) from public;

create or replace function public.create_shop(p_name text, p_slug text, p_business_type text)
returns public.tenants
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return app.create_tenant(auth.uid(), p_name, p_slug, p_business_type, false);
end $$;

-- Hook for the knowledge-base part of the demo (FAQ, policies); filled in by the chat migration.
create or replace function app.seed_demo_kb(p_tenant uuid, p_profile text) returns void
language plpgsql security definer set search_path = '' as $$ begin null; end $$;
revoke execute on function app.seed_demo_kb(uuid, text) from public;
