-- POS-3: every sale gets a 64-hex receipt token; anon reads one receipt only through
-- get_public_receipt(token) — wrong/malformed token = nothing, right token = only that sale,
-- no cost/fee/customer fields, and anon still cannot select sales or sale_items directly.
\o /dev/null
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000020a1', 'owner@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000020a1"}', true);
select set_config('test.t', (public.create_shop('Toko Struk', 'toko-struk', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('20000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price)
  values ('20000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid,
          '20000000-0000-4000-8000-000000000001', 100000);
select public.stock_in('20000000-0000-4000-8000-000000000002', 10, 40000);

do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; res jsonb;
begin
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  res := public.record_sale(t, pos, '[{"variant_id":"20000000-0000-4000-8000-000000000002","qty":2}]', 'receipt-sale-a',
                            p_customer_phone => '+6281234567890', p_customer_name => 'Rina');
  perform set_config('test.a', res->>'sale_id', true);
  res := public.record_sale(t, pos, '[{"variant_id":"20000000-0000-4000-8000-000000000002","qty":1}]', 'receipt-sale-b');
  perform set_config('test.b', res->>'sale_id', true);
  perform set_config('test.token_a', (select receipt_token from public.sales where id = (current_setting('test.a'))::uuid), true);
  perform set_config('test.token_b', (select receipt_token from public.sales where id = (current_setting('test.b'))::uuid), true);
  assert current_setting('test.token_a') ~ '^[0-9a-f]{64}$', 'token is 64 hex';
  assert current_setting('test.token_a') <> current_setting('test.token_b'), 'tokens differ per sale';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
declare r jsonb;
begin
  -- Right token: exactly that sale.
  r := public.get_public_receipt(current_setting('test.token_a'));
  assert r->>'sale_id' = current_setting('test.a'), 'token a opens sale a';
  assert (r->>'total')::bigint = 200000, 'total of sale a';
  assert jsonb_array_length(r->'items') = 1 and (r->'items'->0->>'qty')::int = 2, 'items of sale a only';
  assert r->>'shop_name' = 'Toko Struk', 'shop name';
  assert not (r ? 'platform_fee') and not (r ? 'customer') and not (r->'items'->0 ? 'unit_cost_snapshot'), 'no private fields';
  assert public.get_public_receipt(current_setting('test.token_b'))->>'sale_id' = current_setting('test.b'), 'token b opens sale b';

  -- Wrong / malformed tokens: nothing.
  assert public.get_public_receipt(repeat('0', 64)) is null, 'unknown token';
  assert public.get_public_receipt(upper(current_setting('test.token_a'))) is null, 'case matters';
  assert public.get_public_receipt(left(current_setting('test.token_a'), 63)) is null, 'short token';
  assert public.get_public_receipt(current_setting('test.a')) is null, 'sale id is not a token';
  assert public.get_public_receipt('') is null and public.get_public_receipt(null) is null, 'empty token';

  -- anon still has no table access.
  begin
    perform 1 from public.sales;
    raise exception 'anon read sales';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.sale_items;
    raise exception 'anon read sale_items';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A shop scheduled for deletion stops serving receipts.
reset role;
update public.tenants set deletion_requested_at = now() where id = current_setting('test.t')::uuid;
set local role anon;
do $$
begin
  assert public.get_public_receipt(current_setting('test.token_a')) is null, 'closed shop serves no receipt';
end $$;
rollback;
\o
select 'public receipt: ok' as result;
