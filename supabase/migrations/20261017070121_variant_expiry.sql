-- STK-5: risiko kedaluwarsa. One optional expiry date per variant — the nearest one for
-- the stock on hand (batches are not tracked). The app warns on the Stok screens for
-- variants expiring within N days (default 30) or already past (src/core/expiry.ts).
alter table public.variants add column expires_on date;

-- variants writes are column-granted (20261014161410_stock_sales); RLS keeps updates to
-- the shop owner (20261017070042_role_rls).
grant insert (expires_on), update (expires_on) on public.variants to authenticated;

-- Stok screens look up only variants that have a date.
create index variants_tenant_expires_on_idx on public.variants (tenant_id, expires_on) where expires_on is not null;
