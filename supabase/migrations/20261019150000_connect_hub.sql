-- Pusat Koneksi (ADR-003): the shop's own AI provider, WADAR API keys for outside apps/agents,
-- and Autopilot (agent settings + a task inbox). Secrets never become readable by signed-in users:
-- the AI key is stored as app-side AES-GCM ciphertext and API keys only as a SHA-256 hash, and
-- neither column is granted to `authenticated`.

-- ── 1. AI provider (OpenAI-compatible, per shop) ────────────────────────────
create table public.ai_providers (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  base_url text not null check (base_url ~ '^https://[^[:space:]]+$' and char_length(base_url) <= 300),
  chat_model text not null check (char_length(chat_model) between 1 and 120),
  api_key_cipher text not null check (char_length(api_key_cipher) <= 4000),
  api_key_hint text not null check (char_length(api_key_hint) <= 20),
  enabled boolean not null default true,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text check (char_length(last_test_error) <= 300),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.ai_providers enable row level security;
create policy owner_select on public.ai_providers for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.ai_providers from public, anon, authenticated;
grant select (tenant_id, base_url, chat_model, api_key_hint, enabled, last_test_at, last_test_ok, last_test_error, updated_at)
  on public.ai_providers to authenticated;
grant all on public.ai_providers to service_role;

-- p_api_key_cipher null = keep the stored key (editing the URL/model without retyping it).
create or replace function public.save_ai_provider(
  p_tenant_id uuid, p_base_url text, p_chat_model text, p_api_key_cipher text, p_api_key_hint text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if p_api_key_cipher is null and not exists (select 1 from public.ai_providers where tenant_id = p_tenant_id) then
    raise exception 'API key wajib diisi' using errcode = '22023';
  end if;
  if exists (select 1 from public.ai_providers where tenant_id = p_tenant_id) then
    update public.ai_providers
       set base_url = trim(p_base_url),
           chat_model = trim(p_chat_model),
           api_key_cipher = coalesce(p_api_key_cipher, api_key_cipher),
           api_key_hint = coalesce(p_api_key_hint, api_key_hint),
           enabled = true,
           last_test_at = null, last_test_ok = null, last_test_error = null,
           updated_by = auth.uid(), updated_at = now()
     where tenant_id = p_tenant_id;
  else
    insert into public.ai_providers (tenant_id, base_url, chat_model, api_key_cipher, api_key_hint, updated_by)
    values (p_tenant_id, trim(p_base_url), trim(p_chat_model), p_api_key_cipher, coalesce(p_api_key_hint, ''), auth.uid());
  end if;
  perform app.audit(p_tenant_id, 'ai.provider_saved', null, null,
    jsonb_build_object('base_url', trim(p_base_url), 'model', trim(p_chat_model), 'key_changed', p_api_key_cipher is not null));
end $$;

create or replace function public.set_ai_provider_state(p_tenant_id uuid, p_enabled boolean, p_test_ok boolean default null, p_test_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  update public.ai_providers
     set enabled = coalesce(p_enabled, enabled),
         last_test_at = case when p_test_ok is null then last_test_at else now() end,
         last_test_ok = coalesce(p_test_ok, last_test_ok),
         last_test_error = case when p_test_ok is null then last_test_error else left(p_test_error, 300) end
   where tenant_id = p_tenant_id;
end $$;

create or replace function public.delete_ai_provider(p_tenant_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  delete from public.ai_providers where tenant_id = p_tenant_id;
  perform app.audit(p_tenant_id, 'ai.provider_removed', null, null, '{}'::jsonb);
end $$;

revoke execute on function public.save_ai_provider(uuid, text, text, text, text) from public, anon;
revoke execute on function public.set_ai_provider_state(uuid, boolean, boolean, text) from public, anon;
revoke execute on function public.delete_ai_provider(uuid) from public, anon;
grant execute on function public.save_ai_provider(uuid, text, text, text, text) to authenticated;
grant execute on function public.set_ai_provider_state(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.delete_ai_provider(uuid) to authenticated;

-- ── 2. WADAR API keys ───────────────────────────────────────────────────────
create table public.api_keys (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null unique check (prefix ~ '^wdr_[a-z0-9]{8}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{orders:write,messages:write,catalog:read,summary:read}'
    check (scopes <@ '{orders:write,messages:write,catalog:read,summary:read}'::text[]),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_tenant_idx on public.api_keys (tenant_id, created_at desc);
alter table public.api_keys enable row level security;
create policy owner_select on public.api_keys for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.api_keys from public, anon, authenticated;
grant select (id, tenant_id, name, prefix, scopes, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant all on public.api_keys to service_role;

create or replace function public.create_api_key(p_tenant_id uuid, p_name text, p_prefix text, p_key_hash text, p_scopes text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if (select count(*) from public.api_keys where tenant_id = p_tenant_id and revoked_at is null) >= 10 then
    raise exception 'Maksimal 10 kunci aktif per toko' using errcode = '22023';
  end if;
  insert into public.api_keys (tenant_id, name, prefix, key_hash, scopes, created_by)
  values (p_tenant_id, trim(p_name), p_prefix, p_key_hash, p_scopes, auth.uid())
  returning id into v_id;
  perform app.audit(p_tenant_id, 'api_key.created', 'api_key', v_id, jsonb_build_object('name', trim(p_name), 'prefix', p_prefix));
  return v_id;
end $$;

create or replace function public.revoke_api_key(p_key_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where id = p_key_id;
  if not found then raise exception 'Kunci tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(k.tenant_id, '{owner}');
  update public.api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_key_id;
  perform app.audit(k.tenant_id, 'api_key.revoked', 'api_key', k.id, jsonb_build_object('name', k.name, 'prefix', k.prefix));
end $$;

revoke execute on function public.create_api_key(uuid, text, text, text, text[]) from public, anon;
revoke execute on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.create_api_key(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- An API call acts AS the owner who created the key: the key's creator becomes auth.uid() for
-- this one transaction, so every existing role check, audit row and RLS rule applies unchanged.
-- A key whose creator is no longer the shop's owner stops working by itself.
create or replace function app.act_as_api_key(p_key_id uuid) returns public.api_keys
language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where id = p_key_id and revoked_at is null;
  if not found then raise exception 'API key tidak berlaku' using errcode = '42501'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', k.created_by, 'role', 'authenticated')::text, true);
  perform app.assert_role(k.tenant_id, '{owner}');
  update public.api_keys set last_used_at = now() where id = k.id;
  return k;
end $$;
revoke execute on function app.act_as_api_key(uuid) from public;

create or replace function public.api_import_orders(p_key_id uuid, p_channel_id uuid, p_marketplace text, p_source text, p_orders jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.api_keys;
begin
  k := app.act_as_api_key(p_key_id);
  if not ('orders:write' = any (k.scopes)) then raise exception 'Kunci ini tidak boleh menulis pesanan' using errcode = '42501'; end if;
  return public.import_marketplace_orders(k.tenant_id, p_channel_id, p_marketplace, left(coalesce(p_source, 'api'), 200), p_orders);
end $$;
revoke execute on function public.api_import_orders(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.api_import_orders(uuid, uuid, text, text, jsonb) to service_role;

-- ── 3. Autopilot ────────────────────────────────────────────────────────────
create table public.agent_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  enabled boolean not null default true,
  auto_reorder boolean not null default true,
  auto_faq boolean not null default true,
  auto_reply boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.agent_settings enable row level security;
create policy owner_select on public.agent_settings for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.agent_settings from public, anon, authenticated;
grant select on public.agent_settings to authenticated;
grant all on public.agent_settings to service_role;

create or replace function public.save_agent_settings(p_tenant_id uuid, p_enabled boolean, p_auto_reorder boolean, p_auto_faq boolean, p_auto_reply boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  insert into public.agent_settings as s (tenant_id, enabled, auto_reorder, auto_faq, auto_reply, updated_by)
  values (p_tenant_id, p_enabled, p_auto_reorder, p_auto_faq, p_auto_reply, auth.uid())
  on conflict (tenant_id) do update
     set enabled = excluded.enabled, auto_reorder = excluded.auto_reorder, auto_faq = excluded.auto_faq,
         auto_reply = excluded.auto_reply, updated_by = auth.uid(), updated_at = now();
  perform app.audit(p_tenant_id, 'agent.settings_saved', null, null,
    jsonb_build_object('enabled', p_enabled, 'auto_reorder', p_auto_reorder, 'auto_faq', p_auto_faq, 'auto_reply', p_auto_reply));
end $$;
revoke execute on function public.save_agent_settings(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_agent_settings(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- What the agent prepared. `dedupe_key` keeps one open task per subject (e.g. reorder:<variant>).
create table public.agent_tasks (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('reorder', 'faq')),
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 2000),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create unique index agent_tasks_open_uidx on public.agent_tasks (tenant_id, dedupe_key) where status = 'open';
create index agent_tasks_tenant_idx on public.agent_tasks (tenant_id, status, created_at desc);
alter table public.agent_tasks enable row level security;
create policy owner_select on public.agent_tasks for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.agent_tasks from public, anon, authenticated;
grant select on public.agent_tasks to authenticated;
grant all on public.agent_tasks to service_role;

create or replace function public.close_agent_task(p_task_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.agent_tasks;
begin
  if p_status not in ('done', 'dismissed') then raise exception 'Status tidak dikenal' using errcode = '22023'; end if;
  select * into t from public.agent_tasks where id = p_task_id;
  if not found then raise exception 'Tugas tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(t.tenant_id, '{owner}');
  if t.status <> 'open' then return; end if;
  update public.agent_tasks set status = p_status, decided_at = now(), decided_by = auth.uid() where id = p_task_id;
  perform app.audit(t.tenant_id, 'agent.task_' || p_status, 'agent_task', t.id, jsonb_build_object('kind', t.kind, 'title', t.title));
end $$;
revoke execute on function public.close_agent_task(uuid, text) from public, anon;
grant execute on function public.close_agent_task(uuid, text) to authenticated;
