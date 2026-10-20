-- Jurnal double-entry (ADR-006): Odoo's account.move at UMKM size. Every money-relevant document
-- (sale, void, expense, purchase receipt and payment, stock in and adjustment) is posted as one
-- balanced journal entry by an idempotent job. The ledger is append-only: a mistake is undone by a
-- reversing entry, never by editing. Amounts are integer rupiah computed here, in SQL.

-- ── Chart of accounts: one fixed, small chart for every shop ────────────────
create table public.accounts (
  code text primary key check (code ~ '^[1-6]-[0-9]{4}$'),
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  sort int not null
);
insert into public.accounts (code, name, type, sort) values
  ('1-1000', 'Kas & bank', 'asset', 10),
  ('1-1300', 'Persediaan barang', 'asset', 20),
  ('2-1000', 'Utang ke pemasok', 'liability', 30),
  ('3-1000', 'Modal pemilik', 'equity', 40),
  ('4-1000', 'Penjualan', 'revenue', 50),
  ('5-1000', 'Harga pokok penjualan (HPP)', 'expense', 60),
  ('6-1000', 'Komisi marketplace', 'expense', 70),
  ('6-1100', 'Subsidi ongkir', 'expense', 80),
  ('6-2000', 'Selisih & susut stok', 'expense', 90),
  ('6-9000', 'Beban operasional', 'expense', 100);
alter table public.accounts enable row level security;
create policy read_all on public.accounts for select to authenticated using (true);
revoke all on public.accounts from public, anon, authenticated;
grant select on public.accounts to authenticated, service_role;

-- ── Entries and lines ───────────────────────────────────────────────────────
create table public.journal_entries (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entry_date date not null,
  source_type text not null check (source_type in (
    'sale', 'sale_void', 'expense', 'expense_void', 'purchase_receipt', 'purchase_payment', 'stock_in', 'stock_adjustment')),
  source_id uuid not null,
  memo text not null default '' check (char_length(memo) <= 200),
  posted_at timestamptz not null default now(),
  -- One entry per document: posting again finds nothing new (idempotent).
  unique (tenant_id, source_type, source_id)
);
create index journal_entries_tenant_date_idx on public.journal_entries (tenant_id, entry_date desc);

create table public.journal_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account_code text not null references public.accounts (code),
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  check ((debit = 0) <> (credit = 0))
);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_tenant_account_idx on public.journal_lines (tenant_id, account_code);
create index journal_lines_account_idx on public.journal_lines (account_code);

-- Debit = credit for every entry touched by a statement. Lines of one entry are written in one
-- statement (the posting job does), so the check runs once per statement, not per row.
create or replace function app.check_journal_balance() returns trigger
language plpgsql set search_path = '' as $$
declare v_bad uuid;
begin
  select n.entry_id into v_bad
    from (select distinct entry_id from new_lines) n
    cross join lateral (select sum(l.debit) as d, sum(l.credit) as c from public.journal_lines l where l.entry_id = n.entry_id) t
   where t.d <> t.c
   limit 1;
  if v_bad is not null then
    raise exception 'Jurnal % tidak seimbang: debit dan kredit harus sama', v_bad using errcode = '23514';
  end if;
  return null;
end $$;
create trigger journal_lines_balanced after insert on public.journal_lines
  referencing new table as new_lines for each statement execute function app.check_journal_balance();

-- Append-only, for everyone (the service role too): corrections are reversing entries.
create or replace function app.journal_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Jurnal tidak bisa diubah; buat jurnal balik' using errcode = '42501';
end $$;
create trigger journal_entries_no_update before update on public.journal_entries
  for each row execute function app.journal_append_only();
create trigger journal_lines_no_update before update on public.journal_lines
  for each row execute function app.journal_append_only();

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
create policy owner_select on public.journal_entries for select to authenticated using (app.has_shop_role(tenant_id, '{owner}'));
create policy owner_select on public.journal_lines for select to authenticated using (app.has_shop_role(tenant_id, '{owner}'));
revoke all on public.journal_entries, public.journal_lines from public, anon, authenticated, service_role;
grant select on public.journal_entries, public.journal_lines to authenticated;
-- No UPDATE/DELETE grant for anyone; shop deletion still cascades (foreign keys run as the owner).
grant select, insert on public.journal_entries, public.journal_lines to service_role;

-- ── Posting: everything not posted yet, for one shop ────────────────────────
create or replace function app.post_journal(p_tenant uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text;
  v_before int;
  v_after int;
begin
  select timezone into v_tz from public.tenants where id = p_tenant;
  if v_tz is null then return 0; end if;
  -- One poster per shop at a time (the daily job and an open Neraca page may meet).
  perform pg_advisory_xact_lock(hashtext('post_journal:' || p_tenant::text));
  select count(*) into v_before from public.journal_entries where tenant_id = p_tenant;

  -- 1. Sales (completed, or completed then voided): the same numbers as Keuangan (sale_items with
  --    their allocations). Cash = revenue − commission − shipping subsidy; HPP out of stock.
  with src as (
    select s.id, (s.occurred_at at time zone v_tz)::date as d,
           coalesce(sum(si.qty::bigint * si.unit_price - si.line_discount - si.alloc_order_discount), 0)::bigint as revenue,
           coalesce(sum(si.alloc_platform_fee), 0)::bigint as fee,
           coalesce(sum(si.alloc_shipping_subsidy), 0)::bigint as ship,
           coalesce(sum(si.qty::bigint * si.unit_cost_snapshot), 0)::bigint as cost
      from public.sales s
      left join public.sale_items si on si.sale_id = s.id
     where s.tenant_id = p_tenant and s.status in ('completed', 'void')
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'sale' and e.source_id = s.id)
     group by s.id
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'sale', id, 'Penjualan' from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e
    join src on src.id = e.source_id
    cross join lateral (values
      ('1-1000', greatest(src.revenue - src.fee - src.ship, 0), greatest(src.fee + src.ship - src.revenue, 0)),
      ('6-1000', src.fee, 0::bigint),
      ('6-1100', src.ship, 0::bigint),
      ('4-1000', 0::bigint, src.revenue),
      ('5-1000', src.cost, 0::bigint),
      ('1-1300', 0::bigint, src.cost)
    ) as l(account, debit, credit)
   where l.debit > 0 or l.credit > 0;

  -- 2. Voided sales: the sale's own entry, mirrored, on the day it was voided.
  with src as (
    select s.id, o.id as orig, (s.voided_at at time zone v_tz)::date as d
      from public.sales s
      join public.journal_entries o on o.tenant_id = p_tenant and o.source_type = 'sale' and o.source_id = s.id
     where s.tenant_id = p_tenant and s.status = 'void' and s.voided_at is not null
       and not exists (select 1 from public.journal_entries r where r.tenant_id = p_tenant and r.source_type = 'sale_void' and r.source_id = s.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'sale_void', id, 'Penjualan dibatalkan' from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account_code, l.credit, l.debit
    from entries e join src on src.id = e.source_id join public.journal_lines l on l.entry_id = src.orig;

  -- 3. Expenses (and their voids).
  with src as (
    select x.id, x.occurred_at as d, x.amount, x.category
      from public.expenses x
     where x.tenant_id = p_tenant
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'expense' and e.source_id = x.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'expense', id, left('Pengeluaran: ' || category, 200) from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e join src on src.id = e.source_id
    cross join lateral (values ('6-9000', src.amount, 0::bigint), ('1-1000', 0::bigint, src.amount)) as l(account, debit, credit);

  with src as (
    select x.id, (x.voided_at at time zone v_tz)::date as d, x.amount, x.category
      from public.expenses x
     where x.tenant_id = p_tenant and x.voided_at is not null
       and exists (select 1 from public.journal_entries o where o.tenant_id = p_tenant and o.source_type = 'expense' and o.source_id = x.id)
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'expense_void' and e.source_id = x.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'expense_void', id, left('Pengeluaran dibatalkan: ' || category, 200) from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e join src on src.id = e.source_id
    cross join lateral (values ('1-1000', src.amount, 0::bigint), ('6-9000', 0::bigint, src.amount)) as l(account, debit, credit);

  -- 4. Goods received from a purchase order: stock in, owed to the supplier.
  with src as (
    select r.id, (r.created_at at time zone v_tz)::date as d, r.total, po.number
      from public.purchase_receipts r join public.purchase_orders po on po.id = r.po_id
     where r.tenant_id = p_tenant and r.total > 0
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'purchase_receipt' and e.source_id = r.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'purchase_receipt', id, 'Barang datang ' || number from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e join src on src.id = e.source_id
    cross join lateral (values ('1-1300', src.total, 0::bigint), ('2-1000', 0::bigint, src.total)) as l(account, debit, credit);

  -- 5. Paying the supplier.
  with src as (
    select p.id, (p.paid_at at time zone v_tz)::date as d, p.amount, po.number
      from public.purchase_payments p join public.purchase_orders po on po.id = p.po_id
     where p.tenant_id = p_tenant
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'purchase_payment' and e.source_id = p.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'purchase_payment', id, 'Bayar pemasok ' || number from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e join src on src.id = e.source_id
    cross join lateral (values ('2-1000', src.amount, 0::bigint), ('1-1000', 0::bigint, src.amount)) as l(account, debit, credit);

  -- 6. Stock in outside Pembelian ("Stok masuk"). A product's very first stock (or "Stok awal")
  --    is the owner's starting capital; later ones were bought with the shop's cash.
  with src as (
    select m.id, (m.occurred_at at time zone v_tz)::date as d, m.qty::bigint * coalesce(m.unit_cost, 0) as value,
           (m.ref_type = 'Stok awal' or m.kind = 'import' or not exists (
              select 1 from public.stock_movements p
               where p.variant_id = m.variant_id and (p.occurred_at < m.occurred_at or (p.occurred_at = m.occurred_at and p.id < m.id)))) as opening
      from public.stock_movements m
     where m.tenant_id = p_tenant and m.kind in ('purchase', 'import') and m.qty > 0
       and m.ref_type is distinct from 'purchase_order'
       and m.qty::bigint * coalesce(m.unit_cost, 0) > 0
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'stock_in' and e.source_id = m.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'stock_in', id, case when opening then 'Stok awal (modal)' else 'Stok masuk' end from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e join src on src.id = e.source_id
    cross join lateral (values
      ('1-1300', src.value, 0::bigint),
      (case when src.opening then '3-1000' else '1-1000' end, 0::bigint, src.value)
    ) as l(account, debit, credit);

  -- 7. Adjustments, stock counts and returns to the supplier, at the cost they were booked with.
  with src as (
    select m.id, (m.occurred_at at time zone v_tz)::date as d, m.kind, m.qty,
           abs(m.qty)::bigint * coalesce(m.unit_cost, 0) as value
      from public.stock_movements m
     where m.tenant_id = p_tenant and m.kind in ('adjustment', 'opname', 'return')
       and abs(m.qty)::bigint * coalesce(m.unit_cost, 0) > 0
       and not exists (select 1 from public.journal_entries e where e.tenant_id = p_tenant and e.source_type = 'stock_adjustment' and e.source_id = m.id)
  ), entries as (
    insert into public.journal_entries (tenant_id, entry_date, source_type, source_id, memo)
    select p_tenant, d, 'stock_adjustment', id,
           case when kind = 'return' then 'Retur ke pemasok' when kind = 'opname' then 'Hasil stok opname'
                when qty < 0 then 'Stok berkurang (rusak/hilang)' else 'Stok ditemukan' end
      from src
    returning id, source_id
  )
  insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
  select e.id, p_tenant, l.account, l.debit, l.credit
    from entries e join src on src.id = e.source_id
    cross join lateral (values
      (case when src.qty > 0 then '1-1300' when src.kind = 'return' then '2-1000' else '6-2000' end, src.value, 0::bigint),
      (case when src.qty > 0 then '6-2000' else '1-1300' end, 0::bigint, src.value)
    ) as l(account, debit, credit);

  select count(*) into v_after from public.journal_entries where tenant_id = p_tenant;
  return v_after - v_before;
end $$;
revoke execute on function app.post_journal(uuid) from public;

-- The owner's "Perbarui" (and the Neraca page) or the daily job (service role, no user).
create or replace function public.post_journal(p_tenant_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_role_or_server(p_tenant_id, '{owner}');
  return app.post_journal(p_tenant_id);
end $$;
revoke execute on function public.post_journal(uuid) from public, anon;
grant execute on function public.post_journal(uuid) to authenticated, service_role;

-- Balances per account: within [p_from, p_to] (profit and loss) and up to p_to (balance sheet).
-- Security invoker: RLS decides who sees the shop's ledger (the owner).
create or replace function public.journal_balances(p_tenant_id uuid, p_from date, p_to date)
returns table (account_code text, name text, type text, period_debit bigint, period_credit bigint, closing_debit bigint, closing_credit bigint)
language sql stable security invoker set search_path = '' as $$
  select a.code, a.name, a.type,
         coalesce(sum(l.debit) filter (where e.entry_date between p_from and p_to), 0)::bigint,
         coalesce(sum(l.credit) filter (where e.entry_date between p_from and p_to), 0)::bigint,
         coalesce(sum(l.debit) filter (where e.entry_date <= p_to), 0)::bigint,
         coalesce(sum(l.credit) filter (where e.entry_date <= p_to), 0)::bigint
    from public.accounts a
    left join public.journal_lines l on l.account_code = a.code and l.tenant_id = p_tenant_id
    left join public.journal_entries e on e.id = l.entry_id
   group by a.code, a.name, a.type, a.sort
   order by a.sort
$$;
revoke execute on function public.journal_balances(uuid, date, date) from public, anon;
grant execute on function public.journal_balances(uuid, date, date) to authenticated, service_role;
