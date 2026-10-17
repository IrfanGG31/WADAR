-- GAP #7 — eskalasi ke pemilik dengan notifikasi (PDF Tabel 3 "di luar cakupan langsung dieskalasi
-- ke pemilik", §C.3). When a buyer's chat is handed to a human, the widget route (service role)
-- writes one `notifications` row and, if the owner enabled it, sends a payload-less web push to
-- every `push_subscriptions` device. `notification_prefs`: one row per shop, created on; no row = off.

create table public.notification_prefs (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  on_escalation boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Every shop (existing and new) starts with escalation alerts on.
insert into public.notification_prefs (tenant_id) select id from public.tenants on conflict do nothing;
create or replace function app.default_notification_prefs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_prefs (tenant_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke execute on function app.default_notification_prefs() from public;
create trigger tenants_default_notification_prefs after insert on public.tenants
  for each row execute function app.default_notification_prefs();

create table public.push_subscriptions (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  unique (tenant_id, endpoint)
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create table public.notifications (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('chat_escalated')),
  conversation_id uuid references public.conversations (id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_tenant_time_idx on public.notifications (tenant_id, created_at desc);
create index notifications_conversation_id_idx on public.notifications (conversation_id);

alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

create policy tenant_rw on public.notification_prefs for all to authenticated
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
-- A member registers / removes only their own devices.
create policy own_devices on public.push_subscriptions for all to authenticated
  using (app.is_member(tenant_id) and user_id = (select auth.uid()))
  with check (app.is_member(tenant_id) and user_id = (select auth.uid()));
-- Members read their shop's notifications and mark them read; rows are written by the server only.
create policy member_select on public.notifications for select to authenticated using (app.is_member(tenant_id));
create policy member_mark_read on public.notifications for update to authenticated
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));

revoke all on public.notification_prefs, public.push_subscriptions, public.notifications from public, anon, authenticated;
grant select, insert on public.notification_prefs to authenticated;
grant update (on_escalation, push_enabled, updated_at) on public.notification_prefs to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notification_prefs, public.push_subscriptions, public.notifications to service_role;
