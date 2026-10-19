-- Pusat Koneksi: AI provider secrets, API keys acting as their owner, Autopilot settings + tasks. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000023a1', 'owner@test.local'),
  ('00000000-0000-4000-8000-0000000023b1', 'kasir@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000023a1"}', true);
select set_config('test.t', (public.create_shop('Toko K', 'toko-koneksi', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('23000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price, sku)
  values ('23000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid,
          '23000000-0000-4000-8000-000000000001', 100000, 'SRM-1');
select public.stock_in('23000000-0000-4000-8000-000000000002', 10, 40000);
reset role;
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000023b1', 'cashier');
set local role authenticated;

-- ── AI provider: owner saves, nobody signed in can read the ciphertext ──────
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  perform public.save_ai_provider(t, 'https://api.example.com/v1', 'model-a', 'v1.iv.tag.ct', 'sk-…1234');
  assert (select chat_model from public.ai_providers where tenant_id = t) = 'model-a', 'owner reads settings';
  begin
    perform api_key_cipher from public.ai_providers where tenant_id = t;
    assert false, 'ciphertext not readable by users';
  exception when insufficient_privilege then null;
  end;
  -- Editing without a new key keeps the stored one.
  perform public.save_ai_provider(t, 'https://api.example.com/v1', 'model-b', null, null);
  perform public.set_ai_provider_state(t, null, false, 'HTTP 401');
  assert (select last_test_ok = false and chat_model = 'model-b' and api_key_hint = 'sk-…1234' from public.ai_providers where tenant_id = t), 'edit keeps key';
  begin
    perform public.save_ai_provider(t, 'http://insecure.example.com', 'm', 'v1.a.b.c', 'h');
    assert false, 'https only';
  exception when check_violation then null;
  end;
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'ai.provider_saved'), 'saving audited';
end $$;

-- ── API key: created by the owner, hash never readable ──────────────────────
do $$
declare t uuid := current_setting('test.t')::uuid; k uuid;
begin
  k := public.create_api_key(t, 'Bot WA', 'wdr_abcd1234', repeat('a', 64), '{orders:write,messages:write}');
  perform set_config('test.k', k::text, true);
  assert (select prefix from public.api_keys where id = k) = 'wdr_abcd1234', 'owner lists keys';
  begin
    perform key_hash from public.api_keys where id = k;
    assert false, 'hash not readable by users';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cashier: may not touch any of it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000023b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  begin
    perform public.save_ai_provider(t, 'https://x.example.com', 'm', 'v1.a.b.c', 'h');
    assert false, 'cashier cannot set AI';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_api_key(t, 'x', 'wdr_zzzz0000', repeat('b', 64), '{catalog:read}');
    assert false, 'cashier cannot create keys';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.api_keys) = 0, 'cashier sees no keys';
  assert (select count(*) from public.ai_providers) = 0, 'cashier sees no AI settings';
end $$;

-- ── API import runs as the key's owner (service role, no session) ───────────
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; k uuid := current_setting('test.k')::uuid; ch uuid; r jsonb;
begin
  select id into ch from public.channels where tenant_id = t and kind = 'pos';
  r := public.api_import_orders(k, ch, 'other', 'bot', jsonb_build_array(jsonb_build_object(
    'external_order_id', 'BOT-1', 'status', 'completed',
    'items', jsonb_build_array(jsonb_build_object('variant_id', '23000000-0000-4000-8000-000000000002', 'qty', 2, 'unit_price', 100000)))));
  assert (r->>'created')::int = 1, 'order created through the API';
  assert (select on_hand from public.variants where id = '23000000-0000-4000-8000-000000000002') = 8, 'stock moved';
  assert (select created_by from public.sales where external_order_id = 'BOT-1') = '00000000-0000-4000-8000-0000000023a1', 'acts as the key owner';
  assert (select last_used_at is not null from public.api_keys where id = k), 'usage recorded';
  r := public.api_import_orders(k, ch, 'other', 'bot', jsonb_build_array(jsonb_build_object(
    'external_order_id', 'BOT-1', 'items', jsonb_build_array(jsonb_build_object('variant_id', '23000000-0000-4000-8000-000000000002', 'qty', 1)))));
  assert (r->>'duplicate')::int = 1, 'resend is a duplicate';
  update public.api_keys set revoked_at = now() where id = k;
  begin
    perform public.api_import_orders(k, ch, 'other', 'bot', '[]'::jsonb);
    assert false, 'revoked key refused';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A key stops working when its creator is no longer the owner.
do $$
declare t uuid := current_setting('test.t')::uuid; k2 uuid;
begin
  insert into public.api_keys (tenant_id, name, prefix, key_hash, created_by)
    values (t, 'Kasir key', 'wdr_kasir001', repeat('c', 64), '00000000-0000-4000-8000-0000000023b1') returning id into k2;
  perform set_config('test.k2', k2::text, true);
end $$;
set local role service_role;
do $$
begin
  perform public.api_import_orders(current_setting('test.k2')::uuid, null, 'other', 'bot', '[]'::jsonb);
  assert false, 'non-owner key refused';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ── Autopilot: owner settings, open-task dedupe, closing is audited ─────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000023a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; task uuid;
begin
  perform public.save_agent_settings(t, true, true, false, true);
  assert (select auto_faq = false from public.agent_settings where tenant_id = t), 'settings saved';
  begin
    insert into public.agent_tasks (tenant_id, kind, dedupe_key, title) values (t, 'reorder', 'x', 'y');
    assert false, 'users cannot forge tasks';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
insert into public.agent_tasks (tenant_id, kind, dedupe_key, title)
  values (current_setting('test.t')::uuid, 'reorder', 'reorder:v1', 'Pesan ulang Serum');
do $$
begin
  insert into public.agent_tasks (tenant_id, kind, dedupe_key, title)
    values (current_setting('test.t')::uuid, 'reorder', 'reorder:v1', 'lagi');
  assert false, 'one open task per subject';
exception when unique_violation then null;
end $$;
set local role authenticated;
do $$
declare t uuid := current_setting('test.t')::uuid; task uuid;
begin
  select id into task from public.agent_tasks where tenant_id = t;
  perform public.close_agent_task(task, 'done');
  perform public.close_agent_task(task, 'dismissed');
  assert (select status from public.agent_tasks where id = task) = 'done', 'closing is final';
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'agent.task_done'), 'closing audited';
end $$;

reset role;
rollback;
\o
select 'connect hub: ok' as result;
