-- Event outbox + webhook keluar (ADR-007). Business events are written by triggers in the same
-- transaction as the change (a sale that rolls back leaves no event); WADAR then delivers them,
-- signed, to the URLs the owner registered, with retries. Events carry ids and totals, never HPP.

create table public.outbox_events (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('sale.created', 'sale.voided', 'purchase.received', 'chat.needs_owner', 'ping')),
  subject_id uuid,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create index outbox_events_tenant_time_idx on public.outbox_events (tenant_id, created_at);

create table public.webhook_endpoints (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500),
  events text[] not null check (cardinality(events) > 0 and events <@ '{sale.created,sale.voided,purchase.received,chat.needs_owner}'::text[]),
  secret_cipher text not null check (char_length(secret_cipher) <= 1000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  last_delivery_at timestamptz,
  last_status int,
  last_error text check (char_length(last_error) <= 300)
);
create index webhook_endpoints_tenant_idx on public.webhook_endpoints (tenant_id);

create table public.webhook_deliveries (
  event_id uuid not null references public.outbox_events (id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (char_length(last_error) <= 300),
  primary key (event_id, endpoint_id)
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (tenant_id, next_attempt_at) where status = 'pending';
create index webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id);

alter table public.outbox_events enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
create policy owner_select on public.webhook_endpoints for select to authenticated using (app.has_shop_role(tenant_id, '{owner}'));
create policy owner_select on public.webhook_deliveries for select to authenticated using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.outbox_events, public.webhook_endpoints, public.webhook_deliveries from public, anon, authenticated;
grant select (id, tenant_id, url, events, created_at, last_delivery_at, last_status, last_error) on public.webhook_endpoints to authenticated;
grant select on public.webhook_deliveries to authenticated;
grant all on public.outbox_events, public.webhook_endpoints, public.webhook_deliveries to service_role;

-- ── Event triggers (same transaction as the change) ─────────────────────────
create or replace function app.emit_event(p_tenant uuid, p_type text, p_subject uuid, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.outbox_events (tenant_id, type, subject_id, payload)
  select p_tenant, p_type, p_subject, p_payload
   where exists (select 1 from public.webhook_endpoints w where w.tenant_id = p_tenant and p_type = any (w.events));
$$;
revoke execute on function app.emit_event(uuid, text, uuid, jsonb) from public;

create or replace function app.sales_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'completed' then
    perform app.emit_event(new.tenant_id, 'sale.created', new.id, jsonb_build_object(
      'sale_id', new.id, 'total', new.total, 'channel_id', new.channel_id, 'source', new.source,
      'external_order_id', new.external_order_id, 'payment_method', new.payment_method, 'occurred_at', new.occurred_at));
  elsif tg_op = 'UPDATE' and new.status = 'void' and old.status is distinct from 'void' then
    perform app.emit_event(new.tenant_id, 'sale.voided', new.id, jsonb_build_object(
      'sale_id', new.id, 'total', new.total, 'reason', new.void_reason, 'voided_at', new.voided_at));
  end if;
  return null;
end $$;
create trigger sales_outbox after insert or update of status on public.sales
  for each row execute function app.sales_events();

create or replace function app.receipt_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The receipt row is inserted first and its total set at the end of receiving.
  if new.total is distinct from old.total then
    perform app.emit_event(new.tenant_id, 'purchase.received', new.po_id, jsonb_build_object(
      'purchase_order_id', new.po_id, 'number', (select number from public.purchase_orders where id = new.po_id),
      'receipt_id', new.id, 'value', new.total,
      'status', (select status from public.purchase_orders where id = new.po_id)));
  end if;
  return null;
end $$;
create trigger purchase_receipts_outbox after update of total on public.purchase_receipts
  for each row execute function app.receipt_events();

create or replace function app.conversation_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'escalated' and old.status is distinct from 'escalated' then
    perform app.emit_event(new.tenant_id, 'chat.needs_owner', new.id, jsonb_build_object(
      'conversation_id', new.id, 'channel', new.channel, 'reason', new.escalation_reason));
  end if;
  return null;
end $$;
create trigger conversations_outbox after update of status on public.conversations
  for each row execute function app.conversation_events();

revoke execute on function app.sales_events(), app.receipt_events(), app.conversation_events() from public;

-- ── Owner: register / remove an endpoint (the signing secret is sealed by the app) ──
create or replace function public.create_webhook_endpoint(p_tenant_id uuid, p_url text, p_events text[], p_secret_cipher text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  if (select count(*) from public.webhook_endpoints where tenant_id = p_tenant_id) >= 5 then
    raise exception 'Maksimal 5 webhook per toko' using errcode = '22023';
  end if;
  insert into public.webhook_endpoints (tenant_id, url, events, secret_cipher, created_by)
  values (p_tenant_id, trim(p_url), p_events, p_secret_cipher, auth.uid())
  returning id into v_id;
  perform app.audit(p_tenant_id, 'webhook.created', 'webhook_endpoint', v_id, jsonb_build_object('url', trim(p_url), 'events', p_events));
  return v_id;
end $$;

create or replace function public.delete_webhook_endpoint(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.webhook_endpoints;
begin
  select * into w from public.webhook_endpoints where id = p_id;
  if not found then return; end if;
  perform app.assert_role(w.tenant_id, '{owner}');
  delete from public.webhook_endpoints where id = p_id;
  perform app.audit(w.tenant_id, 'webhook.deleted', 'webhook_endpoint', w.id, jsonb_build_object('url', w.url));
end $$;

revoke execute on function public.create_webhook_endpoint(uuid, text, text[], text) from public, anon;
revoke execute on function public.delete_webhook_endpoint(uuid) from public, anon;
grant execute on function public.create_webhook_endpoint(uuid, text, text[], text) to authenticated;
grant execute on function public.delete_webhook_endpoint(uuid) to authenticated;

-- ── Dispatcher support (service role): fan new events out to their endpoints ──
create or replace function public.queue_webhook_deliveries(p_tenant_id uuid) returns int
language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.webhook_deliveries (event_id, endpoint_id, tenant_id)
    select e.id, w.id, e.tenant_id
      from public.outbox_events e
      join public.webhook_endpoints w on w.tenant_id = e.tenant_id and (e.type = any (w.events) or e.type = 'ping')
     where e.tenant_id = p_tenant_id and e.created_at >= w.created_at
       and (e.type <> 'ping' or e.subject_id = w.id)
       and e.created_at > now() - interval '7 days'
    on conflict do nothing
    returning 1
  )
  select count(*)::int from ins
$$;
revoke execute on function public.queue_webhook_deliveries(uuid) from public, anon, authenticated;
grant execute on function public.queue_webhook_deliveries(uuid) to service_role;
