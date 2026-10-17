-- Answer cache shared by every serverless instance (PDF §C.1 Tabel 9, GAP #10):
-- Customer Chat FAQ replies (written by the widget route, service role) and the
-- daily insight narration (written by the owner's Konsultasi route, RLS).
-- Keys already carry the tenant and a fingerprint of the data the answer was
-- built from; `expires_at` bounds how long a row is served. Rows are
-- disposable: deleting any of them only costs a future model call.

create table public.ai_answer_cache (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cache_key text not null check (char_length(cache_key) between 1 and 300),
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, cache_key)
);
create index ai_answer_cache_expires_idx on public.ai_answer_cache (expires_at);

alter table public.ai_answer_cache enable row level security;
create policy tenant_rw on public.ai_answer_cache for all to authenticated
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));

revoke all on public.ai_answer_cache from public, anon, authenticated;
-- Upsert = insert + update of the payload; expired rows of the owner's shop may be pruned.
grant select, insert, delete on public.ai_answer_cache to authenticated;
grant update (value, expires_at, created_at) on public.ai_answer_cache to authenticated;
grant all on public.ai_answer_cache to service_role;
