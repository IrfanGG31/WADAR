-- Tahap A: audit log, stock adjustment / opname, marketplace import. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000022a1', 'owner@test.local'),
  ('00000000-0000-4000-8000-0000000022b1', 'kasir@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000022a1"}', true);
select set_config('test.t', (public.create_shop('Toko A', 'toko-tahap-a', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('22000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price, sku)
  values ('22000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid,
          '22000000-0000-4000-8000-000000000001', 100000, 'SRM-1');
select public.stock_in('22000000-0000-4000-8000-000000000002', 10, 40000);
reset role;
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000022b1', 'cashier');
set local role authenticated;

-- ── Adjustment, opname, audit ───────────────────────────────────────────────
do $$
declare t uuid := current_setting('test.t')::uuid; v uuid := '22000000-0000-4000-8000-000000000002'; r jsonb;
begin
  r := public.adjust_stock(v, -2, 'rusak', 'pecah');
  assert (r->>'on_hand')::int = 8, 'adjust reduces stock';
  begin
    perform public.adjust_stock(v, 3, 'rusak');
    assert false, 'rusak cannot add stock';
  exception when invalid_parameter_value then null;
  end;
  perform public.adjust_stock(v, -1, 'retur_pemasok');
  assert (select kind from public.stock_movements where variant_id = v order by created_at desc, id desc limit 1) = 'return',
    'retur ke pemasok is a return movement';
  r := public.stock_opname(v, 5, 'hitung akhir bulan');
  assert (r->>'diff')::int = -2 and (r->>'before')::int = 7, 'opname diff';
  assert (select on_hand from public.variants where id = v) = 5, 'opname sets stock';
  assert (select on_hand from public.variants where id = v)
       = (select sum(qty) from public.stock_movements where variant_id = v), 'on_hand = Σ movements';
  r := public.stock_opname(v, 5);
  assert (r->>'diff')::int = 0, 'same count = no movement';
  assert (select count(*) from public.stock_movements where variant_id = v and kind = 'opname') = 1, 'one opname movement';

  update public.variants set price = 120000 where id = v;
  update public.channels set fee_pct = 12 where tenant_id = t and kind = 'pos';
  perform public.log_audit(t, 'data.exported', '{"files":8}');
  assert (select count(*) from public.audit_log where tenant_id = t and action = 'stock.adjusted') = 2, 'adjust audited';
  assert (select count(*) from public.audit_log where tenant_id = t and action = 'stock.counted') = 2, 'opname audited';
  assert (select detail->>'new' from public.audit_log where tenant_id = t and action = 'product.price_changed') = '120000', 'price audited';
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'channel.fee_changed'), 'fee audited';
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'data.exported'), 'export audited';
  begin
    perform public.log_audit(t, 'anything.else');
    assert false, 'unknown action refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.audit_log (tenant_id, action) values (t, 'forged.entry');
    assert false, 'no direct audit inserts';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Cashier: no adjustments, no opname, no audit log, no import ─────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000022b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; v uuid := '22000000-0000-4000-8000-000000000002';
begin
  begin perform public.adjust_stock(v, -1, 'hilang'); assert false, 'cashier adjust';
  exception when insufficient_privilege then null; end;
  begin perform public.stock_opname(v, 1); assert false, 'cashier opname';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.audit_log) = 0, 'cashier reads no audit log';
  begin
    perform public.import_marketplace_orders(t, (select id from public.channels where tenant_id = t limit 1), 'shopee', 'x.csv', '[]');
    assert false, 'cashier import';
  exception when insufficient_privilege then null; end;
end $$;

-- ── Marketplace import ──────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000022a1"}', true);
do $$
declare
  t uuid := current_setting('test.t')::uuid; v uuid := '22000000-0000-4000-8000-000000000002';
  ch uuid; r jsonb; orders jsonb;
begin
  insert into public.channels (tenant_id, kind, name, fee_pct, fee_fixed) values (t, 'shopee', 'Shopee', 10, 1000)
    returning id into ch;
  orders := jsonb_build_array(
    jsonb_build_object('external_order_id', 'SP-001', 'occurred_at', now() - interval '1 day', 'status', 'completed',
      'buyer_name', 'rina_shop', 'order_discount', 10000, 'platform_fee', 25000,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 2, 'unit_price', 110000))),
    jsonb_build_object('external_order_id', 'SP-002', 'status', 'completed', 'buyer_name', 'Rina_Shop',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 4, 'unit_price', 110000))),
    jsonb_build_object('external_order_id', 'SP-003', 'status', 'canceled',
      'items', jsonb_build_array(jsonb_build_object('variant_id', v, 'qty', 1, 'unit_price', 110000))),
    jsonb_build_object('external_order_id', 'SP-004', 'status', 'completed',
      'items', jsonb_build_array(jsonb_build_object('variant_id', '22000000-0000-4000-8000-0000000000ff', 'qty', 1))),
    jsonb_build_object('external_order_id', '', 'items', '[]'::jsonb));
  r := public.import_marketplace_orders(t, ch, 'shopee', 'pesanan.csv', orders);
  assert (r->>'created')::int = 2 and (r->>'canceled')::int = 1 and (r->>'failed')::int = 2, format('counts %s', r);
  assert (select on_hand from public.variants where id = v) = -1, 'stock may go below zero: 5 - 2 - 4';
  assert (select platform_fee from public.sales where external_order_id = 'SP-001') = 25000, 'real fee kept';
  assert (select platform_fee_estimated from public.sales where external_order_id = 'SP-002'), 'fee estimated when missing';
  assert (select platform_fee from public.sales where external_order_id = 'SP-002') = 45000, 'estimate = 10% + 1000';
  assert (select total from public.sales where external_order_id = 'SP-001') = 210000, 'total after seller voucher';
  assert (select status from public.sales where external_order_id = 'SP-003') = 'canceled', 'canceled stored';
  assert (select count(*) from public.customers where tenant_id = t and lower(name) = 'rina_shop') = 1, 'buyer merged by name';
  assert (select orders_count from public.customers where tenant_id = t and lower(name) = 'rina_shop') = 2, 'buyer stats';
  assert (select sum(alloc_platform_fee) from public.sale_items i join public.sales s on s.id = i.sale_id
           where s.external_order_id = 'SP-001') = 25000, 'fee allocated to lines';
  assert (select count(*) from public.marketplace_imports where tenant_id = t) = 1, 'import history';

  -- same file again: nothing doubles
  r := public.import_marketplace_orders(t, ch, 'shopee', 'pesanan.csv', orders);
  assert (r->>'created')::int = 0 and (r->>'duplicate')::int = 3, format('re-import %s', r);
  assert (select count(*) from public.sales where tenant_id = t and source = 'import') = 3, 'no duplicates';
  assert (select on_hand from public.variants where id = v) = -1, 'stock unchanged on re-import';
end $$;

-- ── Expenses: void, never edit ──────────────────────────────────────────────
do $$
declare t uuid := current_setting('test.t')::uuid; e uuid;
begin
  insert into public.expenses (tenant_id, category, amount, occurred_at) values (t, 'Iklan', 50000, current_date)
    returning id into e;
  begin
    update public.expenses set amount = 1 where id = e;
    assert false, 'expenses are not editable';
  exception when insufficient_privilege then null;
  end;
  perform public.void_expense(e, 'salah ketik');
  assert (select voided_at is not null from public.expenses where id = e), 'voided';
  assert ((public.void_expense(e))->>'already')::boolean, 'idempotent';
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'expense.voided'), 'void audited';
end $$;

reset role;
rollback;
\o
select 'tahap a: ok' as result;
