-- Chats from outside apps (ADR-003): bots forwarding Telegram, or any app through /api/v1/messages,
-- get their own channel values next to 'whatsapp' and 'widget'. Kept apart from connect_hub because
-- widening a CHECK constraint needs DROP CONSTRAINT, which the hosted project wants confirmed by a person.
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('whatsapp', 'widget', 'telegram', 'api'));
