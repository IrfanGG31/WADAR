-- D6 Customer Chat: chat_product_cards hides cost/real stock, chat tables are
-- tenant-isolated, messages are append-only with owner replies only, the KB
-- search returns both ranks, demo shops get policies + FAQ. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'sari@test.local'),
  ('00000000-0000-4000-8000-0000000000c2', 'dimas@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1"}', true);
select public.create_demo_shop('skincare');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2"}', true);
select public.create_shop('Toko Dimas', 'toko-dimas-c', 'fnb');
reset role;
select set_config('request.jwt.claims', '{}', true);   -- server context (no JWT user) from here on

-- ── View shape: exactly the §4.4 columns, nothing about cost or real stock ──
do $$ begin
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'chat_product_cards')
         = array['variant_id','tenant_id','name','option_label','category','description','price','availability','qty_hint'],
         'chat_product_cards has exactly the spec columns';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_product_cards'
                      and column_name in ('avg_cost','cost_is_set','on_hand','margin','unit_cost_snapshot')), 'no cost / stock columns';
end $$;

-- ── View values: availability from on_hand, qty_hint = least(on_hand, 5), WA price wins ──
do $$
declare
  t uuid := (select id from public.tenants where name = 'Glow by Sari');
  serum record;
  wa uuid;
begin
  assert (select count(*) from public.chat_product_cards where tenant_id = t) =
         (select count(*) from public.variants v join public.products p on p.id = v.product_id
           where v.tenant_id = t and p.is_active and p.deleted_at is null), 'one card per active variant';
  assert not exists (select 1 from public.chat_product_cards where qty_hint > 5), 'qty_hint never above 5';
  assert not exists (
    select 1 from public.chat_product_cards c join public.variants v on v.id = c.variant_id
     where c.availability <> case when v.on_hand <= 0 then 'habis' when v.on_hand <= 5 then 'sisa_sedikit' else 'tersedia' end
        or c.qty_hint <> least(v.on_hand, 5)), 'availability / qty_hint follow on_hand';

  select v.id, v.price into serum from public.variants v join public.products p on p.id = v.product_id
   where p.tenant_id = t and p.name = 'Serum Vit C 20ml';
  wa := (select id from public.channels where tenant_id = t and kind = 'whatsapp');
  insert into public.channel_prices (variant_id, channel_id, tenant_id, price) values (serum.id, wa, t, 85000);
  assert (select price from public.chat_product_cards where variant_id = serum.id) = 85000, 'WhatsApp channel price wins';
  delete from public.channel_prices where variant_id = serum.id;
  assert (select price from public.chat_product_cards where variant_id = serum.id) = serum.price, 'base price otherwise';

  update public.products set is_active = false where tenant_id = t and name = 'Hair Mist 100ml';
  assert not exists (select 1 from public.chat_product_cards where tenant_id = t and name = 'Hair Mist 100ml'), 'inactive hidden';
  update public.products set is_active = true where tenant_id = t and name = 'Hair Mist 100ml';
end $$;

-- ── Demo knowledge base ─────────────────────────────────────────────────────
do $$
declare t uuid := (select id from public.tenants where name = 'Glow by Sari');
begin
  assert (select policies->'cod'->>'available' from public.store_profile where tenant_id = t) = 'true', 'policies seeded';
  assert (select persona->>'name' from public.store_profile where tenant_id = t) = 'Sari', 'persona seeded';
  assert (select count(*) from public.kb_documents where tenant_id = t and kind = 'faq' and status = 'ready') = 6, '6 FAQ docs';
  assert (select count(*) from public.kb_chunks where tenant_id = t and tsv is not null) = 6, 'FAQ chunks with tsv';
  assert (select kb_version from public.store_profile where tenant_id = t) = 7, 'kb_version bumped per FAQ document';
end $$;

-- ── Hybrid KB search: text side ranks, vector side ranks ────────────────────
do $$
declare
  t uuid := (select id from public.tenants where name = 'Glow by Sari');
  r record;
  q extensions.vector(768);
begin
  select * into r from public.chat_kb_candidates(t, array['bpom', 'produk', '''; drop']) limit 1;
  assert r.kind = 'faq' and r.content like '%BPOM%' and r.txt_rank = 1 and r.vec_rank is null, 'text side finds the BPOM FAQ';
  assert (select count(*) from public.chat_kb_candidates(t, array[]::text[])) = 0, 'no terms, no vector → nothing';

  -- Give two chunks an embedding; the closer one ranks first on the vector side.
  q := ('[' || array_to_string(array_fill(0.0::float4, array[767]) || 1.0::float4, ',') || ']')::extensions.vector;
  update public.kb_chunks set embedding = q where tenant_id = t and content like '%BPOM%';
  update public.kb_chunks set embedding = ('[' || array_to_string(array_fill(0.0::float4, array[766]) || array[1.0::float4, 1.0::float4], ',') || ']')::extensions.vector
   where tenant_id = t and content like '%luar negeri%';
  select * into r from public.chat_kb_candidates(t, array[]::text[], q) order by vec_rank limit 1;
  assert r.content like '%BPOM%' and r.vec_rank = 1 and r.vec_score > 0.99, 'vector side ranks by cosine';
  assert (select count(*) from public.chat_kb_candidates(t, array[]::text[], q)) = 2, 'only embedded chunks on the vector side';

  update public.kb_documents set status = 'failed' where tenant_id = t;
  assert (select count(*) from public.chat_kb_candidates(t, array['bpom'], q)) = 0, 'only ready documents are searched';
  update public.kb_documents set status = 'ready' where tenant_id = t;
end $$;

-- ── Conversations & messages written by the server (service role) ──────────
do $$
declare
  t uuid := (select id from public.tenants where name = 'Glow by Sari');
  c uuid;
begin
  insert into public.conversations (tenant_id, channel, external_user_id) values (t, 'widget', 'sessionAAAAAAAAAAAAAAAAA')
    returning id into c;
  insert into public.messages (tenant_id, conversation_id, direction, author, content, provider_message_id)
    values (t, c, 'in', 'customer', 'serum vit c ready?', 'widget:sessionAAAAAAAAAAAAAAAAA:m1');
  begin
    insert into public.messages (tenant_id, conversation_id, direction, author, content, provider_message_id)
      values (t, c, 'in', 'customer', 'serum vit c ready?', 'widget:sessionAAAAAAAAAAAAAAAAA:m1');
    raise exception 'duplicate provider_message_id accepted';
  exception when unique_violation then null;
  end;
  insert into public.messages (tenant_id, conversation_id, direction, author, content)
    values (t, c, 'out', 'ai', 'Serum Vit C 20ml ready Kak.');
  assert (select last_content from public.inbox_conversations where id = c) = 'Serum Vit C 20ml ready Kak.', 'inbox shows the newest message';
  assert (select last_message_at from public.conversations where id = c) =
         (select max(created_at) from public.messages where conversation_id = c), 'trigger keeps last_message_at';
end $$;

-- ── P1: same-transaction arrivals keep arrival order; P6: negative stock leaks nothing ──
do $$
declare
  t uuid := (select id from public.tenants where name = 'Glow by Sari');
  c uuid;
  v uuid;
begin
  insert into public.conversations (tenant_id, channel, external_user_id) values (t, 'widget', 'sessionORDERORDERORDER')
    returning id into c;
  for i in 1..30 loop
    insert into public.messages (tenant_id, conversation_id, direction, author, content)
      values (t, c, 'in', 'customer', 'a' || i);
    insert into public.messages (tenant_id, conversation_id, direction, author, content)
      values (t, c, 'out', 'ai', 'b' || i);
    assert (select last_content from public.inbox_conversations where id = c) = 'b' || i, 'inbox order is stable, round ' || i;
  end loop;
  assert (select array_agg(content order by created_at, id) from public.messages where conversation_id = c)
         = (select array_agg(x order by o) from (select 'a' || ((o + 1) / 2) as x, o from generate_series(1, 60, 2) o
             union all select 'b' || (o / 2), o from generate_series(2, 60, 2) o) q), 'history order = arrival order';

  select v2.id into v from public.variants v2 join public.products p on p.id = v2.product_id
   where p.tenant_id = t and p.name = 'Serum Vit C 20ml';
  update public.variants set on_hand = -4 where id = v;
  assert (select qty_hint from public.chat_product_cards where variant_id = v) = 0, 'negative stock → qty_hint 0';
  assert (select availability from public.chat_product_cards where variant_id = v) = 'habis', 'negative stock → habis';
end $$;

-- ── P5: kb_version / catalog_version follow §7.5 ────────────────────────────
do $$
declare
  t uuid := (select id from public.tenants where name = 'Glow by Sari');
  kb0 int; cat0 int; d uuid;
begin
  select kb_version, catalog_version into kb0, cat0 from public.store_profile where tenant_id = t;
  insert into public.kb_documents (tenant_id, kind, status) values (t, 'doc', 'processing') returning id into d;
  assert (select kb_version from public.store_profile where tenant_id = t) = kb0 + 1, 'insert bumps kb_version';
  update public.kb_documents set status = 'ready' where id = d;
  assert (select kb_version from public.store_profile where tenant_id = t) = kb0 + 2, 'ready bumps kb_version';
  update public.kb_documents set error = 'x' where id = d;
  assert (select kb_version from public.store_profile where tenant_id = t) = kb0 + 2, 'unrelated update does not bump';
  delete from public.kb_documents where id = d;
  assert (select kb_version from public.store_profile where tenant_id = t) = kb0 + 3, 'delete bumps kb_version';
  insert into public.kb_documents (tenant_id, kind, status) values (t, 'catalog', 'ready') returning id into d;
  assert (select catalog_version from public.store_profile where tenant_id = t) = cat0 + 1, 'catalog insert bumps catalog_version';
  assert (select kb_version from public.store_profile where tenant_id = t) = kb0 + 3, 'catalog insert leaves kb_version';
  update public.kb_documents set checksum = 'abc' where id = d;
  assert (select catalog_version from public.store_profile where tenant_id = t) = cat0 + 2, 'catalog re-sync bumps catalog_version';
  delete from public.kb_documents where id = d;
  assert (select catalog_version from public.store_profile where tenant_id = t) = cat0 + 3
     and (select kb_version from public.store_profile where tenant_id = t) = kb0 + 4, 'catalog delete bumps both';
end $$;

-- Rows for the isolation checks below (server writes ai_runs / chat_sessions).
do $$
declare
  t uuid := (select id from public.tenants where name = 'Glow by Sari');
  c uuid := (select id from public.conversations where tenant_id = t limit 1);
begin
  insert into public.ai_runs (tenant_id, feature, model, cost_idr) values (t, 'customer_chat', 'offline', 12.5);
  insert into public.chat_sessions (tenant_id, conversation_id, window_started_at) values (t, c, now());
end $$;

-- ── The owner: reads, takes over, replies as human — but cannot forge or rewrite ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1"}', true);
do $$
declare c uuid := (select id from public.conversations limit 1);
begin
  assert c is not null, 'owner sees the conversation';
  assert (select count(*) from public.messages where conversation_id = c) = 2, 'owner reads the history';
  assert (select count(*) from public.chat_product_cards) > 0, 'owner can read own cards';
  assert (select count(*) from public.ai_runs) = 1, 'owner reads own ai_runs';
  assert (select count(*) from public.chat_sessions) = 1, 'owner reads own chat_sessions';
  assert (select count(*) from public.chat_kb_candidates((select id from public.tenants where name = 'Glow by Sari'), array['bpom'])) > 0,
         'member can search own KB';
  begin
    update public.ai_runs set cost_idr = 0;
    raise exception 'ai_runs are updatable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chat_sessions (tenant_id, conversation_id, window_started_at)
      select tenant_id, id, now() from public.conversations limit 1;
    raise exception 'owner wrote chat_sessions';
  exception when insufficient_privilege then null;
  end;
  update public.conversations set mode = 'human', status = 'escalated' where id = c;
  insert into public.messages (tenant_id, conversation_id, direction, author, content)
    select tenant_id, id, 'out', 'human', 'Halo Kak, admin di sini.' from public.conversations where id = c;
  begin
    insert into public.messages (tenant_id, conversation_id, direction, author, content)
      select tenant_id, id, 'out', 'ai', 'pesan AI palsu' from public.conversations where id = c;
    raise exception 'owner forged an AI message';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.messages set content = 'diubah' where conversation_id = c;
    raise exception 'messages are updatable';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.messages where conversation_id = c;
    raise exception 'messages are deletable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Another shop sees nothing of it ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2"}', true);
do $$
declare
  t uuid;
  d uuid;
begin
  assert (select count(*) from public.conversations) = 0, 'B cannot read A conversations';
  assert (select count(*) from public.messages) = 0, 'B cannot read A messages';
  assert (select count(*) from public.kb_documents) = 0, 'B cannot read A KB';
  assert (select count(*) from public.chat_product_cards) = 0, 'B cannot read A cards';
  assert (select count(*) from public.inbox_conversations) = 0, 'B cannot read A inbox';
  assert (select count(*) from public.ai_runs) = 0, 'B cannot read A ai_runs';
  assert (select count(*) from public.chat_sessions) = 0, 'B cannot read A chat_sessions';
  assert (select count(*) from public.kb_chunks) = 0, 'B cannot read A kb_chunks';
  reset role;
  t := (select id from public.tenants where name = 'Glow by Sari');
  d := (select id from public.kb_documents where tenant_id = t limit 1);
  set local role authenticated;
  begin
    perform 1 from public.chat_kb_candidates(t, array['bpom']);
    raise exception 'B searched A KB';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kb_chunks (tenant_id, document_id, content) values (t, d, 'racun');
    raise exception 'B inserted a chunk into A KB';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_runs (tenant_id, feature, model) values (t, 'customer_chat', 'x');
    raise exception 'B inserted ai_runs for A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kb_documents (tenant_id, kind, status) values (t, 'faq', 'ready');
    raise exception 'B inserted into A KB';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── anon has no access at all ───────────────────────────────────────────────
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.chat_product_cards;
    raise exception 'anon read chat_product_cards';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.messages;
    raise exception 'anon read messages';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
\o
select 'chat: ok' as result;
