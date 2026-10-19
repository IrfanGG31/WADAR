-- Pembelian: suppliers, orders, Autopilot's approval limit, receiving (stock + avg cost), payments. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000025a1', 'owner25@test.local'),
  ('00000000-0000-4000-8000-0000000025b1', 'kasir25@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000025a1"}', true);
select set_config('test.t', (public.create_shop('Toko Beli', 'toko-beli-25', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name) values
  ('25000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum'),
  ('25000000-0000-4000-8000-000000000003', current_setting('test.t')::uuid, 'Toner');
insert into public.variants (id, tenant_id, product_id, price, sku) values
  ('25000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid, '25000000-0000-4000-8000-000000000001', 100000, 'SRM-25'),
  ('25000000-0000-4000-8000-000000000004', current_setting('test.t')::uuid, '25000000-0000-4000-8000-000000000003', 60000, 'TNR-25');
-- 10 serum on hand at cost 40.000.
select public.stock_in('25000000-0000-4000-8000-000000000002', 10, 40000);
reset role;
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000025b1', 'cashier');
set local role authenticated;

-- ── Suppliers (owner) ───────────────────────────────────────────────────────
do $$
declare t uuid := current_setting('test.t')::uuid; s uuid;
begin
  s := public.save_supplier(t, null, 'CV Kosmetik Jaya', '+6281234567000', 'Kirim Senin');
  perform set_config('test.s', s::text, true);
  begin
    perform public.save_supplier(t, null, ' cv kosmetik jaya ', null, null);
    assert false, 'one supplier per name';
  exception when unique_violation then null;
  end;
  begin
    perform public.save_supplier(t, null, 'Nomor salah', '0812', null);
    assert false, 'phone must be E.164';
  exception when check_violation then null;
  end;
end $$;

-- ── Orders: numbering, merged lines, own variants only ─────────────────────
do $$
declare t uuid := current_setting('test.t')::uuid; r jsonb; r2 jsonb;
begin
  r := public.create_purchase_order(t, current_setting('test.s')::uuid, jsonb_build_array(
    jsonb_build_object('variant_id', '25000000-0000-4000-8000-000000000002', 'qty', 10, 'unit_cost', 45000),
    jsonb_build_object('variant_id', '25000000-0000-4000-8000-000000000004', 'qty', 5, 'unit_cost', 20000),
    jsonb_build_object('variant_id', '25000000-0000-4000-8000-000000000002', 'qty', 10, 'unit_cost', 46000)), 'urgent');
  perform set_config('test.po', r ->> 'id', true);
  assert r ->> 'number' ~ '^PO-[0-9]{4}-0001$', 'first number of the month';
  -- 20 × 46.000 (last cost wins) + 5 × 20.000
  assert (r ->> 'total')::bigint = 1020000, 'total from merged lines';
  assert (select count(*) from public.purchase_order_lines where po_id = (r ->> 'id')::uuid) = 2, 'duplicates merged';
  r2 := public.create_purchase_order(t, null, '[{"variant_id":"25000000-0000-4000-8000-000000000004","qty":1,"unit_cost":0}]'::jsonb);
  perform set_config('test.po2', r2 ->> 'id', true);
  assert r2 ->> 'number' ~ '-0002$', 'numbers count up';
  begin
    perform public.create_purchase_order(t, null, '[{"variant_id":"00000000-0000-4000-8000-00000000ffff","qty":1,"unit_cost":1}]'::jsonb);
    assert false, 'foreign variant refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_purchase_order(t, null, '[]'::jsonb);
    assert false, 'empty order refused';
  exception when invalid_parameter_value then null;
  end;
  -- Editing a draft replaces its lines.
  r := public.update_purchase_order((r ->> 'id')::uuid, current_setting('test.s')::uuid,
    '[{"variant_id":"25000000-0000-4000-8000-000000000002","qty":20,"unit_cost":45000}]'::jsonb, null);
  assert (r ->> 'total')::bigint = 900000, 'edited total';
  assert (select count(*) from public.purchase_order_lines where po_id = current_setting('test.po')::uuid) = 1, 'removed line gone';
end $$;

-- Cashier: sees orders, cannot create, approve, pay or touch suppliers.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000025b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  assert (select count(*) from public.purchase_orders where tenant_id = t) = 2, 'cashier sees orders';
  begin perform public.create_purchase_order(t, null, '[{"variant_id":"25000000-0000-4000-8000-000000000004","qty":1,"unit_cost":1}]'::jsonb); assert false, 'x';
  exception when insufficient_privilege then null; end;
  begin perform public.order_purchase_order(current_setting('test.po')::uuid); assert false, 'cashier cannot approve';
  exception when insufficient_privilege then null; end;
  begin perform public.save_supplier(t, null, 'X', null, null); assert false, 'cashier cannot add suppliers';
  exception when insufficient_privilege then null; end;
end $$;

-- ── Autopilot (server, no user) approves only within the owner's limit ──────
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  perform public.order_purchase_order(current_setting('test.po')::uuid);
  assert false, 'no limit set = never by itself';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000025a1"}', true);
select public.save_agent_purchase_settings(current_setting('test.t')::uuid, true, 500000);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.order_purchase_order(current_setting('test.po')::uuid);   -- 900.000 > 500.000
    assert false, 'over the limit stays a draft';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.order_purchase_order(current_setting('test.po2')::uuid);  -- within the limit, but no supplier
    assert false, 'no supplier, no automatic order';
  exception when insufficient_privilege then null;
  end;
  assert (select status from public.purchase_orders where id = current_setting('test.po')::uuid) = 'draft', 'still draft';
end $$;
reset role;

-- ── Owner approves (the Autopilot task closes with it); cashier receives part, then the rest ──
insert into public.agent_tasks (tenant_id, kind, dedupe_key, title)
  values (current_setting('test.t')::uuid, 'reorder', 'po:' || current_setting('test.po'), 'Setujui pesanan');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000025a1"}', true);
select public.order_purchase_order(current_setting('test.po')::uuid);
do $$
begin
  assert (select status from public.agent_tasks where dedupe_key = 'po:' || current_setting('test.po')) = 'done', 'approval closes the task';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000025b1"}', true);
do $$
declare po uuid := current_setting('test.po')::uuid; r jsonb; v public.variants;
begin
  begin
    perform public.update_purchase_order(po, null, '[{"variant_id":"25000000-0000-4000-8000-000000000002","qty":1,"unit_cost":1}]'::jsonb, null);
    assert false, 'cashier cannot edit';
  exception when insufficient_privilege then null;
  end;
  -- 10 arrive at 50.000 (the invoice price, not the ordered 45.000).
  r := public.receive_purchase_order(po, '[{"variant_id":"25000000-0000-4000-8000-000000000002","qty":10,"unit_cost":50000}]'::jsonb, 'rcv-test-0001');
  assert r ->> 'status' = 'partial', 'partial receipt';
  assert (r ->> 'total')::bigint = 500000, 'receipt value';
  select * into v from public.variants where id = '25000000-0000-4000-8000-000000000002';
  assert v.on_hand = 20, 'stock in';
  assert v.avg_cost = 45000, 'weighted average (10×40k + 10×50k) / 20';
  assert exists (select 1 from public.stock_movements where ref_type = 'purchase_order' and ref_id = po and qty = 10 and unit_cost = 50000), 'movement linked to the order';
  -- Same key again: nothing moves twice.
  r := public.receive_purchase_order(po, '[{"variant_id":"25000000-0000-4000-8000-000000000002","qty":10,"unit_cost":50000}]'::jsonb, 'rcv-test-0001');
  assert (r ->> 'duplicate')::boolean, 'duplicate receipt';
  assert (select on_hand from public.variants where id = '25000000-0000-4000-8000-000000000002') = 20, 'no double stock';
  begin
    perform public.receive_purchase_order(po, '[{"variant_id":"25000000-0000-4000-8000-000000000004","qty":1}]'::jsonb, 'rcv-test-0002');
    assert false, 'item not on the order';
  exception when invalid_parameter_value then null;
  end;
  r := public.receive_purchase_order(po, '[{"variant_id":"25000000-0000-4000-8000-000000000002","qty":10}]'::jsonb, 'rcv-test-0003');
  assert r ->> 'status' = 'received', 'fully received';
  assert (select received_total from public.purchase_orders where id = po) = 1000000, 'received value: 10×50k + 10×50k';
  begin
    perform public.receive_purchase_order(po, '[{"variant_id":"25000000-0000-4000-8000-000000000002","qty":1}]'::jsonb, 'rcv-test-0004');
    assert false, 'finished order takes no more';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.pay_purchase_order(po, 1000000, 'transfer', 'pay-test-0001');
    assert false, 'cashier cannot pay';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Owner pays; supplier memory; cancel rules ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000025a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid; po uuid := current_setting('test.po')::uuid; r jsonb;
begin
  r := public.pay_purchase_order(po, 600000, 'transfer', 'pay-test-0001');
  r := public.pay_purchase_order(po, 600000, 'transfer', 'pay-test-0001');
  assert (r ->> 'duplicate')::boolean, 'same payment once';
  r := public.pay_purchase_order(po, 400000, 'tunai', 'pay-test-0002');
  assert (select paid_total from public.purchase_orders where id = po) = 1000000, 'paid in two parts';
  assert (select last_unit_cost from public.supplier_products where variant_id = '25000000-0000-4000-8000-000000000002') = 50000, 'supplier price learned';
  begin
    perform public.cancel_purchase_order(po);
    assert false, 'received orders cannot be canceled';
  exception when invalid_parameter_value then null;
  end;
  perform public.cancel_purchase_order(current_setting('test.po2')::uuid);
  assert (select status from public.purchase_orders where id = current_setting('test.po2')::uuid) = 'canceled', 'draft canceled';
  begin
    perform public.pay_purchase_order(current_setting('test.po2')::uuid, 1, 'tunai', 'pay-test-0003');
    assert false, 'canceled orders are not paid';
  exception when invalid_parameter_value then null;
  end;
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'purchase.received'), 'receiving audited';
  assert exists (select 1 from public.audit_log where tenant_id = t and action = 'purchase.paid'), 'paying audited';
  begin
    insert into public.purchase_orders (tenant_id, number) values (t, 'PO-0000-9999');
    assert false, 'users cannot write orders directly';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
\o
select 'purchasing: ok' as result;
