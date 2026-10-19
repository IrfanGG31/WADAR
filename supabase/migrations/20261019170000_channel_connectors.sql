-- Direct chat connectors (ADR-004): the shop's own Telegram bot or WhatsApp Cloud API number, wired
-- straight to WADAR with no bot in between. Buyer messages run through the same chat pipeline as the
-- web widget; replies (AI or the owner's, from the inbox) are sent back by WADAR itself.
-- Secrets (bot token, access token, app secret, webhook secret) are app-side AES-GCM ciphertext in a
-- column signed-in users cannot read. Needs conversation_channels (channel 'telegram') first.

create table public.channel_connections (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('telegram', 'whatsapp')),
  -- "@toko_bot", "+62 812-3456-7890": what the owner and the inbox see.
  label text not null default '' check (char_length(label) <= 120),
  -- Non-secret ids: account_id (Telegram bot id / WhatsApp phone number id), waba_id, app_id, username.
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  secret_cipher text not null check (char_length(secret_cipher) <= 8000),
  secret_hint text not null default '' check (char_length(secret_hint) <= 20),
  status text not null default 'pending' check (status in ('pending', 'active', 'error')),
  last_error text check (char_length(last_error) <= 300),
  last_event_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind)
);
-- One bot / one number feeds one shop: Telegram keeps a single webhook per bot, so a second shop
-- connecting the same bot would silently take the first shop's chats.
create unique index channel_connections_account_uidx on public.channel_connections (kind, (settings ->> 'account_id'))
  where settings ? 'account_id';
alter table public.channel_connections enable row level security;
create policy owner_select on public.channel_connections for select to authenticated
  using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.channel_connections from public, anon, authenticated;
grant select (id, tenant_id, kind, label, settings, secret_hint, status, last_error, last_event_at, created_at, updated_at)
  on public.channel_connections to authenticated;
grant all on public.channel_connections to service_role;

-- Connect or reconnect (same row, so the webhook URL stays the same). Starts 'pending' until the
-- provider accepted the webhook; the app then records the outcome with set_channel_connection_status.
create or replace function public.save_channel_connection(
  p_tenant_id uuid, p_kind text, p_label text, p_settings jsonb, p_secret_cipher text, p_secret_hint text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  insert into public.channel_connections as c (tenant_id, kind, label, settings, secret_cipher, secret_hint, created_by)
  values (p_tenant_id, p_kind, left(trim(coalesce(p_label, '')), 120), coalesce(p_settings, '{}'), p_secret_cipher,
          coalesce(p_secret_hint, ''), auth.uid())
  on conflict (tenant_id, kind) do update
     set label = excluded.label, settings = excluded.settings, secret_cipher = excluded.secret_cipher,
         secret_hint = excluded.secret_hint, status = 'pending', last_error = null, updated_at = now()
  returning id into v_id;
  perform app.audit(p_tenant_id, 'channel.connected', 'channel_connection', v_id,
    jsonb_build_object('kind', p_kind, 'label', left(trim(coalesce(p_label, '')), 120)));
  return v_id;
end $$;

create or replace function public.set_channel_connection_status(p_id uuid, p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.channel_connections where id = p_id;
  if not found then raise exception 'Sambungan tidak ditemukan' using errcode = 'P0002'; end if;
  perform app.assert_role(v_tenant, '{owner}');
  update public.channel_connections
     set status = p_status, last_error = case when p_status = 'error' then left(p_error, 300) end, updated_at = now()
   where id = p_id;
end $$;

create or replace function public.delete_channel_connection(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.channel_connections;
begin
  select * into c from public.channel_connections where id = p_id;
  if not found then return; end if;
  perform app.assert_role(c.tenant_id, '{owner}');
  delete from public.channel_connections where id = p_id;
  perform app.audit(c.tenant_id, 'channel.disconnected', 'channel_connection', c.id, jsonb_build_object('kind', c.kind, 'label', c.label));
end $$;

revoke execute on function public.save_channel_connection(uuid, text, text, jsonb, text, text) from public, anon;
revoke execute on function public.set_channel_connection_status(uuid, text, text) from public, anon;
revoke execute on function public.delete_channel_connection(uuid) from public, anon;
grant execute on function public.save_channel_connection(uuid, text, text, jsonb, text, text) to authenticated;
grant execute on function public.set_channel_connection_status(uuid, text, text) to authenticated;
grant execute on function public.delete_channel_connection(uuid) to authenticated;

-- A chat that came in through a connector is answered through it (and not handed to API bots).
-- display_name: the buyer's name as Telegram/WhatsApp gives it, so the inbox is not a list of ids.
alter table public.conversations
  add column connection_id uuid references public.channel_connections (id) on delete set null,
  add column display_name text check (char_length(display_name) <= 80);
create index conversations_connection_id_idx on public.conversations (connection_id) where connection_id is not null;

-- Same view, two columns appended (create or replace keeps the existing ones and the grants).
create or replace view public.inbox_conversations with (security_invoker = on) as
select c.id, c.tenant_id, c.channel, c.external_user_id, c.mode, c.status, c.escalation_reason,
       c.last_message_at, c.created_at,
       lm.content as last_content, lm.author as last_author,
       c.display_name, c.customer_id
from public.conversations c
left join lateral (
  select m.content, m.author from public.messages m
   where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
) lm on true;

-- Did the reply reach the buyer's Telegram/WhatsApp? One row per outgoing message sent through a
-- connector, written by the server only; the inbox shows failures with a resend button.
create table public.message_deliveries (
  message_id uuid primary key references public.messages (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  connection_id uuid references public.channel_connections (id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  attempts int not null default 1 check (attempts between 1 and 1000),
  external_id text check (char_length(external_id) <= 200),
  last_error text check (char_length(last_error) <= 300),
  updated_at timestamptz not null default now()
);
create index message_deliveries_tenant_idx on public.message_deliveries (tenant_id, updated_at desc);
create index message_deliveries_connection_id_idx on public.message_deliveries (connection_id);
alter table public.message_deliveries enable row level security;
create policy member_select on public.message_deliveries for select to authenticated
  using (app.is_member(tenant_id));
revoke all on public.message_deliveries from public, anon, authenticated;
grant select on public.message_deliveries to authenticated;
grant all on public.message_deliveries to service_role;
