-- CON-6: RLS / RPC follow the member's role (src/core/roles.ts), not only membership.
-- Owner = everything; cashier = sales + stock in; chat admin = chat + notifications.
-- Everyone in the shop still reads.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000016a1', 'owner@test.local'),
  ('00000000-0000-4000-8000-0000000016b1', 'kasir@test.local'),
  ('00000000-0000-4000-8000-0000000016c1', 'chat@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016a1"}', true);
select set_config('test.t', (public.create_shop('Toko Peran', 'toko-peran', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('16000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price)
  values ('16000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid, '16000000-0000-4000-8000-000000000001', 100000);
select public.stock_in('16000000-0000-4000-8000-000000000002', 10, 40000);

reset role;
insert into public.conversations (id, tenant_id, channel, external_user_id)
  values ('16000000-0000-4000-8000-000000000003', current_setting('test.t')::uuid, 'widget', 'buyer-role-test');
insert into public.memberships (tenant_id, user_id, role) values
  (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000016b1', 'cashier'),
  (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000016c1', 'chat_admin');
set local role authenticated;

-- ── Cashier ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; n int;
begin
  assert app.has_shop_role(t, '{owner,cashier}'), 'cashier has the cashier role';
  assert not app.has_shop_role(t, '{owner}'), 'cashier is not the owner';
  -- reads stay open
  assert (select count(*) from public.products where tenant_id = t) = 1, 'cashier reads the catalog';
  -- the till works
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  perform public.record_sale(t, pos, '[{"variant_id":"16000000-0000-4000-8000-000000000002","qty":1}]', 'role-sale-1');
  perform public.stock_in('16000000-0000-4000-8000-000000000002', 5, 40000);
  insert into public.customers (tenant_id, name) values (t, 'Rina');

  -- owner-only writes are refused
  begin
    insert into public.products (tenant_id, name) values (t, 'Toner');
    assert false, 'cashier must not add products';
  exception when insufficient_privilege then null;
  end;
  update public.products set name = 'Diganti' where tenant_id = t;
  get diagnostics n = row_count;
  assert n = 0, 'cashier must not rename products';
  update public.variants set price = 1 where tenant_id = t;
  get diagnostics n = row_count;
  assert n = 0, 'cashier must not change prices';
  begin
    insert into public.expenses (tenant_id, category, amount, occurred_at) values (t, 'Iklan', 5000, current_date);
    assert false, 'cashier must not add expenses';
  exception when insufficient_privilege then null;
  end;
  update public.store_profile set persona = '{"x":1}' where tenant_id = t;
  get diagnostics n = row_count;
  assert n = 0, 'cashier must not edit the store profile';
  update public.tenants set name = 'Toko Kasir' where id = t;
  get diagnostics n = row_count;
  assert n = 0, 'cashier must not rename the shop';
  begin
    insert into public.kb_documents (tenant_id, kind, title, status) values (t, 'faq', 'Q?', 'processing');
    assert false, 'cashier must not add FAQ';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.memory_items (tenant_id, kind, content, source) values (t, 'fact', 'ingat ini ya', 'consult');
    assert false, 'cashier must not write Konsultasi memory';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (tenant_id, conversation_id, direction, author, content)
      values (t, '16000000-0000-4000-8000-000000000003', 'out', 'human', 'halo');
    assert false, 'cashier must not reply to buyers';
  exception when insufficient_privilege then null;
  end;
  update public.conversations set mode = 'human' where tenant_id = t;
  get diagnostics n = row_count;
  assert n = 0, 'cashier must not take over chats';
  begin
    perform public.save_product(t, null, '{"name":"Toner","variants":[{"price":1000}]}');
    assert false, 'cashier must not save products via RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.import_catalog(t, 'x.csv', '[]'::jsonb);
    assert false, 'cashier must not import the catalog';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reset_demo_shop(t);
    assert false, 'cashier must not reset the shop';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.request_shop_deletion(t, 'toko-peran');
    assert false, 'cashier must not delete the shop';
  exception when insufficient_privilege then null;
  end;
  -- movements are written only by the definer functions (no INSERT grant)
  begin
    insert into public.stock_movements (tenant_id, variant_id, qty, kind) values (t, '16000000-0000-4000-8000-000000000002', -3, 'adjustment');
    assert false, 'no direct movement inserts';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Chat admin ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016c1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; n int;
begin
  update public.conversations set mode = 'human' where tenant_id = t;
  get diagnostics n = row_count;
  assert n = 1, 'chat admin takes over';
  insert into public.messages (tenant_id, conversation_id, direction, author, content)
    values (t, '16000000-0000-4000-8000-000000000003', 'out', 'human', 'halo kak');

  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  begin
    perform public.record_sale(t, pos, '[{"variant_id":"16000000-0000-4000-8000-000000000002","qty":1}]', 'role-sale-2');
    assert false, 'chat admin must not record sales';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.stock_in('16000000-0000-4000-8000-000000000002', 5, 40000);
    assert false, 'chat admin must not book stock in';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.customers (tenant_id, name) values (t, 'Budi');
    assert false, 'chat admin must not add customers';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.expenses (tenant_id, category, amount, occurred_at) values (t, 'Iklan', 5000, current_date);
    assert false, 'chat admin must not add expenses';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Owner: unchanged ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; n int;
begin
  insert into public.expenses (tenant_id, category, amount, occurred_at) values (t, 'Iklan', 5000, current_date);
  update public.variants set price = 120000 where tenant_id = t;
  get diagnostics n = row_count;
  assert n = 1, 'owner changes prices';
  update public.tenants set name = 'Toko Peran Baru' where id = t;
  get diagnostics n = row_count;
  assert n = 1, 'owner renames the shop';
  assert (select count(*) from public.sales where tenant_id = t) = 1, 'owner sees the cashier sale';
end $$;

-- ── The till trigger itself ─────────────────────────────────────────────────
-- record_sale / stock_in insert movements as definer (grants and RLS bypassed), so only
-- check_till_role stands between a member's JWT and the movement kinds.
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost) values (t, '16000000-0000-4000-8000-000000000002', 1, 'purchase', 40000);
  begin
    insert into public.stock_movements (tenant_id, variant_id, qty, kind) values (t, '16000000-0000-4000-8000-000000000002', -3, 'adjustment');
    assert false, 'cashier must not adjust stock';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016c1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  insert into public.stock_movements (tenant_id, variant_id, qty, kind, unit_cost) values (t, '16000000-0000-4000-8000-000000000002', 1, 'purchase', 40000);
  assert false, 'chat admin must not move stock';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000016a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  insert into public.stock_movements (tenant_id, variant_id, qty, kind) values (t, '16000000-0000-4000-8000-000000000002', -1, 'adjustment');
end $$;

-- ── Server (no JWT user) is never blocked by the till trigger ───────────────
select set_config('request.jwt.claims', '{}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  insert into public.stock_movements (tenant_id, variant_id, qty, kind) values (t, '16000000-0000-4000-8000-000000000002', 1, 'opname');
end $$;

rollback;
\o
select '16_role_rls ok';
