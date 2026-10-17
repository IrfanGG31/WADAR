-- GAP #7: notification prefs default on per shop; notifications are server-written, member-read,
-- tenant-isolated; push devices belong to their user.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000a2', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
select set_config('test.t', (public.create_shop('Toko Notif', 'toko-notif', 'fnb')).id::text, true);
do $$ begin
  assert (select on_escalation and not push_enabled from public.notification_prefs where tenant_id = current_setting('test.t')::uuid),
    'a new shop starts with escalation alerts on, push off';
end $$;
update public.notification_prefs set on_escalation = false where tenant_id = current_setting('test.t')::uuid;
insert into public.push_subscriptions (tenant_id, endpoint, p256dh, auth)
  values (current_setting('test.t')::uuid, 'https://fcm.googleapis.com/fcm/send/x', 'p', 'a');
do $$ begin
  insert into public.notifications (tenant_id, kind, title, body) values (current_setting('test.t')::uuid, 'chat_escalated', 't', 'b');
  assert false, 'members must not write notifications';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000000a2', 'https://fcm.googleapis.com/fcm/send/y', 'p', 'a');
  assert false, 'a device must belong to the signed-in user';
exception when insufficient_privilege then null;
end $$;
reset role;

-- the server (service role) writes the notification
set local role service_role;
insert into public.notifications (tenant_id, kind, title, body)
  values (current_setting('test.t')::uuid, 'chat_escalated', 'Chat perlu dibalas', 'AI kurang yakin. Buka Chat untuk membalas.');
reset role;

set local role authenticated;
do $$ begin
  assert (select count(*) from public.notifications) = 1, 'owner sees the notification';
end $$;
update public.notifications set read_at = now();
do $$ begin
  update public.notifications set body = 'x';
  assert false, 'only read_at may change';
exception when insufficient_privilege then null;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2"}', true);
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'another owner must not read it';
  assert (select count(*) from public.notification_prefs) = 0, 'nor the prefs';
  assert (select count(*) from public.push_subscriptions) = 0, 'nor the devices';
end $$;
set local role anon;
do $$ begin
  perform 1 from public.notifications;
  assert false, 'anon must not read notifications';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
\o
select 'escalation notifications: ok' as result;
