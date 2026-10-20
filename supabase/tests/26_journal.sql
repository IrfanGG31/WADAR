-- Jurnal: every document posts one balanced entry, idempotently; voids reverse; the ledger is
-- append-only; stock value and Keuangan's numbers reconcile with it. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000026a1', 'owner26@test.local'),
  ('00000000-0000-4000-8000-0000000026b1', 'kasir26@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000026a1"}', true);
select set_config('test.t', (public.create_shop('Toko Jurnal', 'toko-jurnal-26', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('26000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price, sku)
  values ('26000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid, '26000000-0000-4000-8000-000000000001', 100000, 'SRM-26');
-- Opening stock (capital) then a cash restock: 10 @ 40.000, then 10 @ 50.000 → average 45.000.
select public.stock_in('26000000-0000-4000-8000-000000000002', 10, 40000, 'Stok awal');
select public.stock_in('26000000-0000-4000-8000-000000000002', 10, 50000);
reset role;
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000026b1', 'cashier');
set local role authenticated;

do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; res jsonb; s uuid; po jsonb; e uuid;
begin
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  -- Two sales of 2 × 100.000; the second is voided.
  res := public.record_sale(t, pos, '[{"variant_id":"26000000-0000-4000-8000-000000000002","qty":2}]', 'jrn-sale-1');
  res := public.record_sale(t, pos, '[{"variant_id":"26000000-0000-4000-8000-000000000002","qty":2}]', 'jrn-sale-2');
  perform set_config('test.sale2', res ->> 'sale_id', true);
  perform public.void_sale((res ->> 'sale_id')::uuid, 'salah input');
  -- An expense of 75.000, and one of 10.000 voided.
  insert into public.expenses (tenant_id, category, amount, occurred_at) values (t, 'Listrik', 75000, current_date);
  insert into public.expenses (tenant_id, category, amount, occurred_at) values (t, 'Salah', 10000, current_date) returning id into e;
  perform public.void_expense(e, 'dobel');
  -- 2 broken (at average cost 45.000).
  perform public.adjust_stock('26000000-0000-4000-8000-000000000002', -2, 'rusak');
  -- Purchase order: 10 @ 44.000 received, 300.000 paid so far.
  po := public.create_purchase_order(t, null, '[{"variant_id":"26000000-0000-4000-8000-000000000002","qty":10,"unit_cost":44000}]'::jsonb);
  perform public.order_purchase_order((po ->> 'id')::uuid);
  perform public.receive_purchase_order((po ->> 'id')::uuid, '[{"variant_id":"26000000-0000-4000-8000-000000000002","qty":10}]'::jsonb, 'jrn-rcv-0001');
  perform public.pay_purchase_order((po ->> 'id')::uuid, 300000, 'transfer', 'jrn-pay-0001');
end $$;

-- ── Posting ─────────────────────────────────────────────────────────────────
do $$
declare t uuid := current_setting('test.t')::uuid; n int; bal record; stock_value bigint;
begin
  n := public.post_journal(t);
  -- 2 stock in + 2 sales + 1 void + 2 expenses + 1 expense void + 1 adjustment + 1 receipt + 1 payment
  assert n = 11, format('11 entries posted, got %s', n);
  assert public.post_journal(t) = 0, 'posting again finds nothing new';
  assert (select count(*) from (
            select entry_id from public.journal_lines where tenant_id = t group by entry_id having sum(debit) <> sum(credit)) x) = 0,
         'every entry balanced';
  assert (select sum(debit) = sum(credit) from public.journal_lines where tenant_id = t), 'trial balance';

  -- Account balances (debit − credit).
  select
    sum(case when account_code = '1-1000' then debit - credit else 0 end) as kas,
    sum(case when account_code = '1-1300' then debit - credit else 0 end) as stok,
    sum(case when account_code = '2-1000' then credit - debit else 0 end) as utang,
    sum(case when account_code = '3-1000' then credit - debit else 0 end) as modal,
    sum(case when account_code = '4-1000' then credit - debit else 0 end) as jual,
    sum(case when account_code = '5-1000' then debit - credit else 0 end) as hpp,
    sum(case when account_code = '6-2000' then debit - credit else 0 end) as susut,
    sum(case when account_code = '6-9000' then debit - credit else 0 end) as beban
    into bal from public.journal_lines where tenant_id = t;
  assert bal.modal = 400000, 'opening stock is capital';
  assert bal.jual = 200000, 'one sale counts, the voided one is reversed';
  assert bal.hpp = 90000, 'HPP 2 × 45.000';
  assert bal.beban = 75000, 'voided expense reversed';
  assert bal.susut = 90000, '2 broken × 45.000';
  assert bal.utang = 140000, 'received 440.000, paid 300.000';
  -- Cash: −500.000 restock + 200.000 sale − 75.000 expense − 300.000 supplier = −675.000
  assert bal.kas = -675000, format('cash %s', bal.kas);
  -- Inventory in the ledger = stock value on the shelf, up to the rounding of the whole-rupiah
  -- average cost (≤ Rp0,5 per unit): 26 × 44.615 = 1.159.990 vs 1.160.000 booked.
  select on_hand::bigint * avg_cost into stock_value from public.variants where id = '26000000-0000-4000-8000-000000000002';
  assert bal.stok = 1160000, format('ledger stock %s', bal.stok);
  assert abs(bal.stok - stock_value) * 2 <= (select on_hand from public.variants where id = '26000000-0000-4000-8000-000000000002'),
         format('ledger stock %s vs shelf %s beyond rounding', bal.stok, stock_value);
  -- Profit in the ledger = Keuangan's (fin_daily) revenue − cost for the same sales.
  assert (select sum(revenue_gross - line_discount - order_discount_alloc) from public.fin_daily where tenant_id = t) = bal.jual, 'revenue reconciles';
  assert (select sum(cost) from public.fin_daily where tenant_id = t) = bal.hpp, 'HPP reconciles';
  -- The summary function agrees.
  assert (select closing_credit - closing_debit from public.journal_balances(t, current_date - 1, current_date + 1) where account_code = '4-1000') = 200000,
         'journal_balances';
end $$;

-- ── Append-only, balanced, owner-only ───────────────────────────────────────
reset role;
do $$
declare t uuid := current_setting('test.t')::uuid; eid uuid;
begin
  begin
    update public.journal_entries set memo = 'diubah' where tenant_id = t;
    assert false, 'entries cannot be edited, not even by the server';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.journal_lines set debit = debit + 1 where tenant_id = t and debit > 0;
    assert false, 'lines cannot be edited';
  exception when insufficient_privilege then null;
  end;
  insert into public.journal_entries (tenant_id, entry_date, source_type, source_id) values (t, current_date, 'expense', gen_random_uuid())
    returning id into eid;
  begin
    insert into public.journal_lines (entry_id, tenant_id, account_code, debit, credit)
      values (eid, t, '6-9000', 1000, 0), (eid, t, '1-1000', 0, 999);
    assert false, 'unbalanced entry refused';
  exception when check_violation then null;
  end;
end $$;
set local role service_role;
do $$
begin
  delete from public.journal_lines where tenant_id = current_setting('test.t')::uuid;
  assert false, 'the server cannot delete ledger lines';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000026b1"}', true);
do $$
begin
  assert (select count(*) from public.journal_entries) = 0, 'cashier sees no ledger';
  begin
    perform public.post_journal(current_setting('test.t')::uuid);
    assert false, 'cashier cannot post';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
\o
select 'journal: ok' as result;
