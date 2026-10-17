alter table public.variants add column expires_on date;

grant insert (expires_on), update (expires_on) on public.variants to authenticated;

create index variants_tenant_expires_on_idx on public.variants (tenant_id, expires_on) where expires_on is not null;
