-- Direct chat connectors: owner-only, secrets unreadable, one bot per shop, deliveries server-written. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000024a1', 'owner24@test.local'),
  ('00000000-0000-4000-8000-0000000024a2', 'owner24b@test.local'),
  ('00000000-0000-4000-8000-0000000024b1', 'kasir24@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000024a2"}', true);
select set_config('test.t2', (public.create_shop('Toko Lain', 'toko-lain-24', 'kecantikan')).id::text, true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000024a1"}', true);
select set_config('test.t', (public.create_shop('Toko C', 'toko-konektor', 'kecantikan')).id::text, true);
reset role;
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000024b1', 'cashier');
set local role authenticated;

-- ── Owner connects a bot; the secrets column stays unreadable ───────────────
do $$
declare t uuid := current_setting('test.t')::uuid; c uuid; c2 uuid;
begin
  c := public.save_channel_connection(t, 'telegram', '@toko_bot', '{"account_id":"777","username":"toko_bot"}', 'v1.iv.tag.ct', '…AbCd');
  perform set_config('test.c', c::text, true);
  assert (select label = '@toko_bot' and status = 'pending' from public.channel_connections where id = c), 'owner reads the connection';
  begin
    perform secret_cipher from public.channel_connections where id = c;
    assert false, 'ciphertext not readable by users';
  exception when insufficient_privilege then null;
  end;
  perform public.set_channel_connection_status(c, 'error', 'HTTP 401');
  assert (select status = 'error' and last_error = 'HTTP 401' from public.channel_connections where id = c), 'status recorded';
  -- Reconnecting keeps the row (and so the webhook URL) and clears the error.
  c2 := public.save_channel_connection(t, 'telegram', '@toko_bot', '{"account_id":"777","username":"toko_bot"}', 'v1.iv2.tag.ct', '…EfGh');
  assert c2 = c, 'same row on reconnect';
  assert (select status = 'pending' and last_error is null and secret_hint = '…EfGh' from public.channel_connections where id = c), 'reconnect resets';
  perform public.set_channel_connection_status(c, 'active');
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'channel.connected'), 'connecting audited';
  begin
    perform public.save_channel_connection(t, 'line', 'x', '{}', 'v1.a.b.c', '');
    assert false, 'unknown kind refused';
  exception when check_violation then null;
  end;
end $$;

-- Another shop cannot take the same bot.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000024a2"}', true);
do $$
begin
  perform public.save_channel_connection(current_setting('test.t2')::uuid, 'telegram', '@toko_bot', '{"account_id":"777"}', 'v1.a.b.c', '');
  assert false, 'one bot, one shop';
exception when unique_violation then null;
end $$;
do $$
begin
  assert (select count(*) from public.channel_connections) = 0, 'other owner sees nothing of shop 1';
  begin
    perform public.delete_channel_connection(current_setting('test.c')::uuid);
    assert false, 'other owner cannot disconnect';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cashier: no access.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000024b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  assert (select count(*) from public.channel_connections) = 0, 'cashier sees no connections';
  begin
    perform public.save_channel_connection(t, 'whatsapp', '+62', '{}', 'v1.a.b.c', '');
    assert false, 'cashier cannot connect';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_channel_connection_status(current_setting('test.c')::uuid, 'active');
    assert false, 'cashier cannot change status';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Server side: a connector chat and its delivery record ───────────────────
reset role;
do $$
declare t uuid := current_setting('test.t')::uuid; conv uuid; msg uuid;
begin
  insert into public.conversations (tenant_id, channel, external_user_id, connection_id)
    values (t, 'telegram', '123456', current_setting('test.c')::uuid) returning id into conv;
  insert into public.messages (tenant_id, conversation_id, direction, author, content)
    values (t, conv, 'out', 'ai', 'Halo Kak') returning id into msg;
  insert into public.message_deliveries (message_id, tenant_id, connection_id, status, external_id)
    values (msg, t, current_setting('test.c')::uuid, 'sent', '42');
  perform set_config('test.conv', conv::text, true);
  perform set_config('test.msg', msg::text, true);
end $$;

-- Members read delivery status (the inbox), but only the server writes it.
set local role authenticated;
do $$
begin
  assert (select status from public.message_deliveries where message_id = current_setting('test.msg')::uuid) = 'sent', 'member reads delivery';
  begin
    update public.message_deliveries set status = 'failed';
    assert false, 'users cannot change deliveries';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Disconnecting keeps the chat history; the chat just stops pointing at the connector.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000024a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  perform public.delete_channel_connection(current_setting('test.c')::uuid);
  assert not exists (select 1 from public.channel_connections where tenant_id = t), 'disconnected';
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'channel.disconnected'), 'disconnect audited';
end $$;
reset role;
do $$
begin
  assert (select connection_id is null from public.conversations where id = current_setting('test.conv')::uuid), 'chat kept, link cleared';
  assert (select connection_id is null from public.message_deliveries where message_id = current_setting('test.msg')::uuid), 'delivery kept';
end $$;

rollback;
\o
select 'channel connectors: ok' as result;
