-- D7 Konsultasi Bisnis (CON-3, CON-4; TECH-SPEC §4.2, §7.4): owner memory and stored weekly insights.
-- NOT yet applied to hosted. `insights` deviates from §4.2 in one place: uniqueness is
-- (tenant_id, dedupe_key, period_start), because the same insight may legitimately come back
-- in a later week (dedupe is 7 days, enforced by the generator, not by a lifetime unique key).

create table public.memory_items (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null default 'preference' check (kind in ('preference', 'fact', 'decision')),
  content text not null check (char_length(content) between 3 and 280),
  source text,
  pinned boolean not null default true,
  created_at timestamptz not null default now()
);
create index memory_items_tenant_idx on public.memory_items (tenant_id, created_at);

create table public.insights (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  engine text not null check (engine in ('stock', 'finance', 'chat', 'consult')),
  type text not null,
  severity smallint not null default 1 check (severity between 1 and 3),
  title text not null,
  body text not null,
  evidence jsonb not null,
  dedupe_key text not null,
  status text not null default 'new' check (status in ('new', 'seen', 'acted', 'dismissed')),
  period_start date,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key, period_start)
);
create index insights_tenant_time_idx on public.insights (tenant_id, created_at);

alter table public.memory_items enable row level security;
alter table public.insights enable row level security;
create policy tenant_rw on public.memory_items for all to authenticated
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
create policy tenant_rw on public.insights for all to authenticated
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));

-- The owner's own notes are the one write the consult path makes; no UPDATE/DELETE on memory
-- for the app, and insights only get their status changed.
revoke all on public.memory_items, public.insights from anon, authenticated;
grant select, insert on public.memory_items to authenticated;
grant select, insert on public.insights to authenticated;
grant update (status) on public.insights to authenticated;
grant all on public.memory_items, public.insights to service_role;
