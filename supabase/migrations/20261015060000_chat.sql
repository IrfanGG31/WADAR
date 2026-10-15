-- D6 Customer Chat — TECH-SPEC §4.2 (kb_documents, kb_chunks, conversations,
-- messages, chat_sessions, ai_runs), §4.4 (chat_product_cards), §7.3, §7.5.
-- store_profile and the products.name trigram index already exist (core migration).
--
-- The customer-chat path reads ONLY chat_product_cards + store_profile + kb_*:
-- the view has no cost, no margin and no real stock (qty_hint ≤ 5) by construction.

-- ── Product cards for customer chat (§4.4, verbatim) ────────────────────────
create or replace view public.chat_product_cards with (security_invoker = on) as
select v.id as variant_id, v.tenant_id, p.name, v.option_label, p.category, p.description,
       coalesce(cp.price, v.price) as price,          -- harga kanal WA jika ada
       case when v.on_hand <= 0 then 'habis'
            when v.on_hand <= 5 then 'sisa_sedikit' else 'tersedia' end as availability,
       least(greatest(v.on_hand, 0), 5) as qty_hint   -- tidak membuka stok sebenarnya > 5; stok negatif tidak bocor
from public.variants v join public.products p on p.id = v.product_id
left join public.channel_prices cp on cp.variant_id = v.id
  and cp.channel_id = (select id from public.channels c where c.tenant_id = v.tenant_id and c.kind = 'whatsapp' limit 1)
where p.is_active and p.deleted_at is null;
-- TIDAK ada kolom avg_cost / margin. Tool customer chat hanya boleh membaca view ini.

-- ── Knowledge base (§4.2, §7.5) ─────────────────────────────────────────────
create table public.kb_documents (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('doc', 'faq', 'catalog', 'policy')),
  title text,
  source_path text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  checksum text,
  error text,
  created_at timestamptz not null default now()
);
create index kb_documents_tenant_kind_idx on public.kb_documents (tenant_id, kind);

create table public.kb_chunks (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  content text not null,
  tokens int,
  embedding extensions.vector(768),
  tsv tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  metadata jsonb not null default '{}'
);
create index kb_chunks_document_id_idx on public.kb_chunks (document_id);
create index kb_chunks_tenant_id_idx on public.kb_chunks (tenant_id);
create index kb_chunks_embedding_hnsw_idx on public.kb_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index kb_chunks_tsv_idx on public.kb_chunks using gin (tsv);

-- ── Conversations & messages (§4.2) ─────────────────────────────────────────
create table public.conversations (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'widget')),
  customer_id uuid references public.customers (id) on delete set null,
  external_user_id text not null,
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  status text not null default 'open' check (status in ('open', 'escalated', 'closed')),
  escalation_reason text,
  last_inbound_at timestamptz,
  window_expires_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, channel, external_user_id)
);
create index conversations_inbox_idx on public.conversations (tenant_id, last_message_at desc);
create index conversations_customer_id_idx on public.conversations (customer_id);

create table public.ai_runs (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  cached_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_idr numeric(12, 2) not null default 0,
  latency_ms int,
  guardrail jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index ai_runs_tenant_time_idx on public.ai_runs (tenant_id, created_at);

create table public.messages (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  author text not null check (author in ('customer', 'ai', 'human', 'system')),
  content text,
  media jsonb,
  provider_message_id text unique,
  ai_run_id uuid references public.ai_runs (id) on delete set null,
  meta jsonb not null default '{}',   -- engine (llm/offline), escalation cause, unsafe flag
  -- clock_timestamp(), not now(): messages of one transaction must still order by arrival.
  created_at timestamptz not null default clock_timestamp()
);
-- History order = (created_at, id). app.uuid_v7() only has millisecond precision, so id alone is
-- not a total order for messages that arrive within the same millisecond; id is the tie-breaker.
create index messages_conversation_idx on public.messages (conversation_id, created_at, id);
create index messages_tenant_time_idx on public.messages (tenant_id, created_at);
create index messages_ai_run_id_idx on public.messages (ai_run_id);

-- Meter "percakapan" (BRL-03): one row per 24-hour window of a conversation.
create table public.chat_sessions (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  window_started_at timestamptz not null,
  primary key (conversation_id, window_started_at)
);
create index chat_sessions_tenant_time_idx on public.chat_sessions (tenant_id, window_started_at);

-- Inbox ordering follows the newest message.
create or replace function app.touch_conversation() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at
   where id = new.conversation_id and last_message_at < new.created_at;
  return new;
end $$;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function app.touch_conversation();

-- KB-4 / §7.5: ingest, re-ingest (status/checksum/kind change) and delete bump the version, so caches
-- keyed on (kb_version, catalog_version) expire. catalog documents bump catalog_version; deleting
-- any document also bumps kb_version ("Hapus dokumen → kb_version++").
create or replace function app.bump_kb_version() returns trigger
language plpgsql set search_path = '' as $$
declare
  r public.kb_documents;
  b_kb int := 0;
  b_cat int := 0;
begin
  if tg_op = 'DELETE' then
    r := old;
    b_kb := 1;
    b_cat := case when r.kind = 'catalog' then 1 else 0 end;
  else
    r := new;
    if r.kind = 'catalog' then b_cat := 1; else b_kb := 1; end if;
    if tg_op = 'UPDATE' and old.kind = 'catalog' and r.kind <> 'catalog' then b_cat := 1; end if;
  end if;
  update public.store_profile
     set kb_version = kb_version + b_kb, catalog_version = catalog_version + b_cat
   where tenant_id = r.tenant_id;
  return null;
end $$;
create trigger kb_documents_bump_version after insert or delete on public.kb_documents
  for each row execute function app.bump_kb_version();
create trigger kb_documents_bump_version_upd after update on public.kb_documents
  for each row when (old.status is distinct from new.status or old.checksum is distinct from new.checksum
                     or old.kind is distinct from new.kind)
  execute function app.bump_kb_version();

-- Inbox list: each conversation with its newest message.
create or replace view public.inbox_conversations with (security_invoker = on) as
select c.id, c.tenant_id, c.channel, c.external_user_id, c.mode, c.status, c.escalation_reason,
       c.last_message_at, c.created_at,
       lm.content as last_content, lm.author as last_author
from public.conversations c
left join lateral (
  select m.content, m.author from public.messages m
   where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
) lm on true;

-- ── RLS (§4.3) ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['kb_documents', 'kb_chunks', 'conversations', 'chat_sessions', 'ai_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_rw on public.%I for all to authenticated
         using (app.is_member(tenant_id)) with check (app.is_member(tenant_id))', t);
  end loop;
end $$;

-- Messages: members read their shop's messages and may only add their own manual replies.
-- Buyer, AI and system messages are written by the server (service role) only.
alter table public.messages enable row level security;
create policy messages_member_select on public.messages for select to authenticated
  using (app.is_member(tenant_id));
create policy messages_member_reply on public.messages for insert to authenticated
  with check (app.is_member(tenant_id) and author = 'human' and direction = 'out');

revoke all on public.kb_documents, public.kb_chunks, public.conversations, public.messages,
  public.chat_sessions, public.ai_runs, public.chat_product_cards, public.inbox_conversations
  from anon, authenticated;
grant select, insert, update, delete on public.kb_documents, public.kb_chunks to authenticated;
grant select, update on public.conversations to authenticated;
-- Append-only for the app (like sales): no UPDATE/DELETE on messages, ai_runs, chat_sessions.
grant select, insert on public.messages, public.ai_runs to authenticated;
grant select on public.chat_sessions, public.chat_product_cards, public.inbox_conversations to authenticated;
grant all on public.kb_documents, public.kb_chunks, public.conversations, public.messages,
  public.chat_sessions, public.ai_runs to service_role;
grant select on public.chat_product_cards, public.inbox_conversations to service_role;

-- ── Hybrid KB search (§7.3 step 3) ──────────────────────────────────────────
-- Vector top-k (cosine) and tsvector top-k ('simple', OR of the given terms)
-- over ready documents; the app fuses the two ranks with RRF (src/core/chat/retrieval.ts).
-- Catalog chunks only take part on the vector side (product names are matched by trigram).
create or replace function public.chat_kb_candidates(
  p_tenant_id uuid, p_terms text[], p_embedding extensions.vector(768) default null, p_k int default 20)
returns table (id uuid, document_id uuid, kind text, content text, metadata jsonb,
               vec_rank int, txt_rank int, vec_score double precision)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  -- A signed-in user must be a member of p_tenant_id; the server (service role, no JWT user) may
  -- search any shop. RLS would hide rows anyway — this keeps it safe if the function is ever made definer.
  if (select auth.uid()) is not null and not app.is_member(p_tenant_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;
  return query
  with docs as (
    select d.id, d.kind from public.kb_documents d
     where d.tenant_id = p_tenant_id and d.status = 'ready'
  ),
  terms as (
    select coalesce(array_agg(distinct lower(x)) filter (where lower(x) ~ '^[a-z0-9]{2,30}$'), '{}') as list
      from unnest(coalesce(p_terms, '{}')) x
  ),
  q as (
    select case when cardinality(list) > 0 then to_tsquery('simple', array_to_string(list, ' | ')) end as tsq from terms
  ),
  vec as (
    select c.id,
           (row_number() over (order by c.embedding operator(extensions.<=>) p_embedding, c.id))::int as r,
           1 - (c.embedding operator(extensions.<=>) p_embedding) as score
      from public.kb_chunks c join docs d on d.id = c.document_id
     where p_embedding is not null and c.tenant_id = p_tenant_id and c.embedding is not null
     order by c.embedding operator(extensions.<=>) p_embedding, c.id
     limit greatest(p_k, 1)
  ),
  txt as (
    select c.id, (row_number() over (order by ts_rank_cd(c.tsv, q.tsq) desc, c.id))::int as r
      from public.kb_chunks c join docs d on d.id = c.document_id cross join q
     where q.tsq is not null and d.kind <> 'catalog' and c.tenant_id = p_tenant_id and c.tsv @@ q.tsq
     order by ts_rank_cd(c.tsv, q.tsq) desc, c.id
     limit greatest(p_k, 1)
  )
  select c.id, c.document_id, d.kind, c.content, c.metadata, vec.r, txt.r, vec.score
    from public.kb_chunks c
    join docs d on d.id = c.document_id
    left join vec on vec.id = c.id
    left join txt on txt.id = c.id
   where vec.id is not null or txt.id is not null
   order by coalesce(vec.r, 1000000), coalesce(txt.r, 1000000);
end $$;
revoke execute on function public.chat_kb_candidates(uuid, text[], extensions.vector, int) from public, anon;
grant execute on function public.chat_kb_candidates(uuid, text[], extensions.vector, int) to authenticated, service_role;

-- ── Demo knowledge base (fills the hook from 20261014162429_demo_seed_tenant) ─
-- The skincare JSON is mirrored in src/core/chat/fixtures/glow-by-sari.ts and
-- checked by src/core/chat/seed-sync.test.ts — edit both together.
create or replace function app.seed_demo_kb(p_tenant uuid, p_profile text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_policies jsonb;
  v_persona jsonb;
  v_faq jsonb;
  f jsonb;
  v_doc uuid;
begin
  if p_profile = 'kopi' then
    v_policies := $policy_kopi$
{
  "hours": "Setiap hari 07.00–22.00 WIB",
  "address": "Jl. Gejayan No. 21, Depok, Sleman, Yogyakarta",
  "shipping_areas": "Pesan antar lewat GoFood atau kurir toko untuk radius 5 km.",
  "shipping_estimates": [
    { "area": "Radius 5 km", "cost_min": 5000, "cost_max": 10000, "eta": "30–45 menit", "keywords": ["gejayan", "depok", "sleman", "ugm", "uny"] }
  ],
  "cod": { "available": true, "note": "bayar ke kurir toko untuk radius 5 km" },
  "payment_methods": ["Tunai", "QRIS", "Transfer BCA", "GoPay"],
  "returns": "Minuman yang salah atau tumpah saat diantar kami ganti di hari yang sama.",
  "warranty": "",
  "processing_time": "Pesanan disiapkan 10–15 menit.",
  "order_steps": "Tulis menu, jumlah, dan alamat antar di chat ini, atau pesan lewat GoFood.",
  "admin_contact": "0813-2900-4567",
  "promo": ""
}
$policy_kopi$::jsonb;
    v_persona := '{"name": "Dimas", "salutation": "Kak", "style": "santai", "emoji": true, "holding_message": ""}'::jsonb;
    v_faq := $faq_kopi$
[
  { "question": "Kopinya pakai biji apa?", "answer": "House blend arabika Gayo dan robusta Temanggung, disangrai sendiri tiap minggu." },
  { "question": "Bisa pesan untuk acara kantor?", "answer": "Bisa Kak, untuk pesanan di atas 30 cup mohon kabari H-1 lewat chat ini." },
  { "question": "Ada pilihan susu oat?", "answer": "Ada Kak, semua minuman berbasis susu bisa diganti susu oat." }
]
$faq_kopi$::jsonb;
  else
    v_policies := $policy_skincare$
{
  "hours": "Senin–Sabtu 09.00–20.00 WIB, Minggu 10.00–17.00 WIB",
  "address": "Jl. Kaliurang Km 5 No. 12, Sleman, Yogyakarta",
  "shipping_areas": "Kirim ke seluruh Indonesia lewat JNE, J&T, dan SiCepat. Area Jogja bisa kurir instan.",
  "shipping_estimates": [
    { "area": "Jogja & sekitarnya", "cost_min": 8000, "cost_max": 15000, "eta": "hari yang sama, kurir instan", "keywords": ["jogja", "yogyakarta", "sleman", "bantul"] },
    { "area": "Pulau Jawa", "cost_min": 12000, "cost_max": 25000, "eta": "2–4 hari", "keywords": ["jakarta", "bandung", "surabaya", "semarang", "solo", "malang", "jawa"] },
    { "area": "Luar Jawa", "cost_min": 25000, "cost_max": 60000, "eta": "3–7 hari", "keywords": ["bali", "medan", "makassar", "sumatra", "kalimantan", "sulawesi", "papua"] }
  ],
  "cod": { "available": true, "note": "lewat J&T untuk seluruh Pulau Jawa, bayar ke kurir saat paket sampai" },
  "payment_methods": ["Transfer BCA", "Transfer Mandiri", "QRIS", "ShopeePay", "COD"],
  "returns": "Tukar atau retur maksimal 3 hari setelah paket diterima, segel belum dibuka, dan sertakan video unboxing.",
  "warranty": "Garansi produk original 100% dan sudah terdaftar BPOM.",
  "processing_time": "Pesanan sebelum jam 15.00 dikirim di hari yang sama.",
  "order_steps": "Tulis nama produk, jumlah, nama penerima, alamat lengkap, dan nomor HP di chat ini. Admin akan kirim total dan nomor rekening.",
  "admin_contact": "0812-2700-3456",
  "promo": "Gratis ongkir Pulau Jawa untuk belanja minimal Rp250.000."
}
$policy_skincare$::jsonb;
    v_persona := $persona_skincare$
{
  "name": "Sari",
  "salutation": "Kak",
  "style": "santai",
  "emoji": true,
  "holding_message": "Pertanyaan Kakak sudah aku teruskan ke admin ya. Mohon tunggu sebentar, admin akan balas langsung di chat ini 🙏"
}
$persona_skincare$::jsonb;
    v_faq := $faq_skincare$
[
  { "question": "Apakah semua produk sudah BPOM?", "answer": "Iya Kak, semua produk Glow by Sari original dan sudah terdaftar BPOM." },
  { "question": "Bagaimana cara pakai Serum Vit C?", "answer": "Pakai pagi hari setelah toner: 2–3 tetes, ratakan di wajah, lalu lanjut pelembap dan sunscreen." },
  { "question": "Apakah aman untuk ibu hamil?", "answer": "Untuk ibu hamil dan menyusui, hindari Retinol Serum dan konsultasikan dulu dengan dokter ya Kak." },
  { "question": "Kulit sensitif cocok pakai apa?", "answer": "Untuk kulit sensitif, mulai dari Gentle Cleanser, Hyaluronic Toner, dan Moisturizer Gel. Tes dulu di belakang telinga ya Kak." },
  { "question": "Bisa kirim ke luar negeri?", "answer": "Belum bisa Kak, untuk sekarang kami hanya kirim ke seluruh Indonesia." },
  { "question": "Apakah ada toko offline?", "answer": "Ada Kak, di Jl. Kaliurang Km 5 No. 12, Sleman. Buka Senin–Sabtu 09.00–20.00 WIB." }
]
$faq_skincare$::jsonb;
  end if;

  update public.store_profile set policies = v_policies, persona = v_persona where tenant_id = p_tenant;

  -- FAQ: one document + one chunk per pair (§7.5). Ready without an embedding: the
  -- tsvector side finds them; "Buat embedding" in Pengaturan adds the vectors.
  if not exists (select 1 from public.kb_documents where tenant_id = p_tenant and kind = 'faq') then
    for f in select value from jsonb_array_elements(v_faq) loop
      insert into public.kb_documents (tenant_id, kind, title, status)
      values (p_tenant, 'faq', f->>'question', 'ready')
      returning id into v_doc;
      insert into public.kb_chunks (tenant_id, document_id, content, metadata)
      values (p_tenant, v_doc, 'Tanya: ' || (f->>'question') || E'\nJawab: ' || (f->>'answer'),
              jsonb_build_object('kind', 'faq', 'question', f->>'question', 'answer', f->>'answer'));
    end loop;
  end if;
end $$;
revoke execute on function app.seed_demo_kb(uuid, text) from public;

-- Demo shops created before this migration get their policies + FAQ now.
do $$
declare t public.tenants;
begin
  for t in select * from public.tenants
            where is_demo and not exists (select 1 from public.kb_documents d where d.tenant_id = tenants.id)
  loop
    perform app.seed_demo_kb(t.id, app.demo_profile(t));
  end loop;
end $$;
