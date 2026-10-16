-- Security review P3: a message (and a chat_sessions row) must belong to a
-- conversation of the same shop. The single-column FKs allowed tenant A's
-- owner to insert a reply with tenant_id = A into tenant B's conversation id
-- (RLS only checks tenant_id). Composite FKs make that impossible by construction.

alter table public.conversations
  add constraint conversations_id_tenant_key unique (id, tenant_id);

alter table public.messages
  add constraint messages_conversation_tenant_fkey
  foreign key (conversation_id, tenant_id) references public.conversations (id, tenant_id)
  on delete cascade not valid;
alter table public.chat_sessions
  add constraint chat_sessions_conversation_tenant_fkey
  foreign key (conversation_id, tenant_id) references public.conversations (id, tenant_id)
  on delete cascade not valid;

-- Enforced for new rows from here on; old rows are checked when they are all consistent
-- (a mismatch is reported instead of failing the deploy).
do $$
begin
  if not exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
                  where c.tenant_id <> m.tenant_id) then
    alter table public.messages validate constraint messages_conversation_tenant_fkey;
  else
    raise warning 'messages with a conversation of another tenant exist; constraint left NOT VALID';
  end if;
  if not exists (select 1 from public.chat_sessions s join public.conversations c on c.id = s.conversation_id
                  where c.tenant_id <> s.tenant_id) then
    alter table public.chat_sessions validate constraint chat_sessions_conversation_tenant_fkey;
  else
    raise warning 'chat_sessions with a conversation of another tenant exist; constraint left NOT VALID';
  end if;
end $$;
