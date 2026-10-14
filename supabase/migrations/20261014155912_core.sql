-- 0001 core — TECH-SPEC §4.1, §4.2 (store_profile), §4.3, trimmed to the BPC sprint
-- (SPRINT-8D §1): owner-only shops, catalog + stock, customers, sales, expenses.
-- Money is bigint rupiah; percentages numeric(6,3).

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- UUIDv7: time-ordered ids (TECH-SPEC §4 convention), built on gen_random_uuid().
create or replace function app.uuid_v7() returns uuid
language sql volatile set search_path = '' as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
        from 1 for 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;
grant execute on function app.uuid_v7() to authenticated, service_role;

-- ── Tenants & membership ────────────────────────────────────────────────────
create type public.member_role as enum ('owner', 'cashier', 'chat_admin');

create table public.tenants (
  id uuid primary key default app.uuid_v7(),
  name text not null check (length(trim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  business_type text,
  timezone text not null default 'Asia/Jakarta',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- TECH-SPEC §4.3. security definer so policies on memberships itself don't recurse.
create or replace function app.is_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid())
  )
$$;
revoke execute on function app.is_member(uuid) from public;
grant execute on function app.is_member(uuid) to authenticated, service_role;

-- ── Channels & commissions (FIN-2) ──────────────────────────────────────────
create type public.channel_kind as enum ('pos', 'manual', 'whatsapp', 'instagram', 'shopee', 'tiktok_shop',
  'tokopedia', 'gofood', 'grabfood', 'shopeefood', 'website', 'other');

create table public.channels (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind public.channel_kind not null,
  name text not null,
  fee_pct numeric(6, 3) not null default 0 check (fee_pct >= 0 and fee_pct < 100),
  fee_fixed bigint not null default 0 check (fee_fixed >= 0),
  fee_is_default boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index channels_tenant_id_idx on public.channels (tenant_id);

-- ── Catalog ─────────────────────────────────────────────────────────────────
create table public.products (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text,
  description text,
  unit text not null default 'pcs',
  image_path text,            -- sprint: emoji or image URL (no upload yet)
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index products_tenant_id_idx on public.products (tenant_id);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);

create table public.variants (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku text,
  barcode text,
  option_label text,          -- "Merah / L"
  price bigint not null check (price >= 0),
  avg_cost bigint not null default 0 check (avg_cost >= 0),
  cost_is_set boolean not null default false,
  min_stock int not null default 0 check (min_stock >= 0),
  lead_time_days int not null default 3 check (lead_time_days >= 0),
  pack_size int not null default 1 check (pack_size >= 1),
  on_hand int not null default 0,   -- projection of stock_movements, updated in the same transaction
  created_at timestamptz not null default now(),
  unique (tenant_id, sku)
);
create index variants_tenant_id_idx on public.variants (tenant_id);
create index variants_product_id_idx on public.variants (product_id);

create table public.channel_prices (
  variant_id uuid not null references public.variants (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  price bigint not null check (price >= 0),
  primary key (variant_id, channel_id)
);
create index channel_prices_tenant_id_idx on public.channel_prices (tenant_id);
create index channel_prices_channel_id_idx on public.channel_prices (channel_id);

-- ── Stock ───────────────────────────────────────────────────────────────────
create type public.movement_kind as enum ('purchase', 'sale', 'adjustment', 'return', 'void', 'opname', 'import');

create table public.stock_movements (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  qty int not null check (qty <> 0),   -- signed: + in, - out
  kind public.movement_kind not null,
  unit_cost bigint,
  ref_type text,
  ref_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index stock_movements_variant_time_idx on public.stock_movements (variant_id, occurred_at);
create index stock_movements_tenant_time_idx on public.stock_movements (tenant_id, occurred_at);

-- ── Customers ───────────────────────────────────────────────────────────────
create table public.customers (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text,
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  first_channel public.channel_kind,
  notes text,
  tags text[] not null default '{}',
  total_spent bigint not null default 0,
  orders_count int not null default 0,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone_e164)
);

-- ── Sales (append-only; only status may change, via a function) ────────────
create type public.sale_source as enum ('pos', 'manual', 'import');
create type public.sale_status as enum ('completed', 'void', 'canceled', 'returned');

create table public.sales (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel_id uuid not null references public.channels (id),
  source public.sale_source not null,
  external_order_id text,
  customer_id uuid references public.customers (id),
  status public.sale_status not null default 'completed',
  subtotal bigint not null check (subtotal >= 0),
  order_discount bigint not null default 0 check (order_discount >= 0),
  shipping_subsidy bigint not null default 0 check (shipping_subsidy >= 0),
  platform_fee bigint not null default 0 check (platform_fee >= 0),
  platform_fee_estimated boolean not null default false,
  total bigint not null check (total >= 0),
  payment_method text,
  note text,
  occurred_at timestamptz not null default now(),
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, channel_id, external_order_id),
  unique (tenant_id, idempotency_key)
);
create index sales_tenant_time_idx on public.sales (tenant_id, occurred_at);
create index sales_channel_id_idx on public.sales (channel_id);
create index sales_customer_id_idx on public.sales (customer_id);

create table public.sale_items (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  variant_id uuid references public.variants (id),
  name_snapshot text not null,
  qty int not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  line_discount bigint not null default 0 check (line_discount >= 0),
  unit_cost_snapshot bigint not null check (unit_cost_snapshot >= 0),
  cost_is_set_snapshot boolean not null default true,
  alloc_order_discount bigint not null default 0,
  alloc_platform_fee bigint not null default 0,
  alloc_shipping_subsidy bigint not null default 0
);
create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_tenant_variant_idx on public.sale_items (tenant_id, variant_id);

-- ── Expenses (FIN-1) ────────────────────────────────────────────────────────
create table public.expenses (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category text not null,
  amount bigint not null check (amount > 0),
  occurred_at date not null,
  note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index expenses_tenant_day_idx on public.expenses (tenant_id, occurred_at);

-- ── Store profile: policies + persona for Customer Chat (KB-1, CHT-3) ──────
create table public.store_profile (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  policies jsonb not null default '{}',
  persona jsonb not null default '{}',
  kb_version int not null default 1,
  catalog_version int not null default 1
);

-- ── RLS (TECH-SPEC §4.3) ───────────────────────────────────────────────────
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;

create policy tenants_member_select on public.tenants for select to authenticated
  using (app.is_member(id));
create policy tenants_owner_update on public.tenants for update to authenticated
  using (app.is_member(id)) with check (app.is_member(id));

create policy memberships_own_or_shop on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.is_member(tenant_id));

do $$
declare t text;
begin
  foreach t in array array['channels', 'products', 'variants', 'channel_prices', 'stock_movements',
                           'customers', 'sales', 'sale_items', 'expenses', 'store_profile']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_rw on public.%I for all to authenticated
         using (app.is_member(tenant_id)) with check (app.is_member(tenant_id))', t);
  end loop;
end $$;

-- Explicit grants: Supabase's default privileges hand ALL to anon/authenticated,
-- so revoke first, then grant only what each role needs. anon gets nothing.
revoke all on public.tenants, public.memberships, public.channels, public.products, public.variants,
  public.channel_prices, public.stock_movements, public.customers, public.sales, public.sale_items,
  public.expenses, public.store_profile from anon, authenticated;
grant select, update on public.tenants to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update, delete on public.channels, public.products, public.variants,
  public.channel_prices, public.customers, public.store_profile to authenticated;
-- Append-only (TECH-SPEC §3.2): no UPDATE/DELETE for app users.
grant select, insert on public.stock_movements, public.sales, public.sale_items, public.expenses to authenticated;
grant all on all tables in schema public to service_role;

-- ── create_shop (ONB-1): tenant + owner membership + default channels ───────
create or replace function public.create_shop(p_name text, p_slug text, p_business_type text)
returns public.tenants
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_tenant public.tenants;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.tenants (name, slug, business_type)
  values (trim(p_name), lower(trim(p_slug)), nullif(trim(p_business_type), ''))
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, role) values (v_tenant.id, v_user, 'owner');

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
revoke execute on function public.create_shop(text, text, text) from public, anon;
grant execute on function public.create_shop(text, text, text) to authenticated;
