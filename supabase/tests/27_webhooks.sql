-- Outbox + webhooks: events in the same transaction, only when someone listens; owner-only endpoints. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000027a1', 'owner27@test.local'),
  ('00000000-0000-4000-8000-0000000027b1', 'kasir27@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000027a1"}', true);
select set_config('test.t', (public.create_shop('Toko Hook', 'toko-hook-27', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name) values ('27000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price, sku)
  values ('27000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid, '27000000-0000-4000-8000-000000000001', 100000, 'SRM-27');
select public.stock_in('27000000-0000-4000-8000-000000000002', 10, 40000);
reset role;
insert into public.memberships (tenant_id, user_id, role) values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000027b1', 'cashier');
set local role authenticated;

do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; w uuid;
begin
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  -- Nobody listens yet: a sale leaves no event.
  perform public.record_sale(t, pos, '[{"variant_id":"27000000-0000-4000-8000-000000000002","qty":1}]', 'hook-sale-0');
  reset role;
  assert (select count(*) from public.outbox_events where tenant_id = t) = 0, 'no listener, no event';
  set local role authenticated;
  w := public.create_webhook_endpoint(t, 'https://hooks.example.com/wadar', '{sale.created,sale.voided,chat.needs_owner}', 'v1.a.b.c');
  perform set_config('test.w', w::text, true);
  begin
    perform secret_cipher from public.webhook_endpoints;
    assert false, 'secret not readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_webhook_endpoint(t, 'http://plain.example.com', '{sale.created}', 'v1.a.b.c');
    assert false, 'https only';
  exception when check_violation then null;
  end;
end $$;

-- Cashier: cannot register endpoints.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000027b1"}', true);
do $$
begin
  perform public.create_webhook_endpoint(current_setting('test.t')::uuid, 'https://x.example.com', '{sale.created}', 'v1.a.b.c');
  assert false, 'cashier refused';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000027a1"}', true);

do $$
declare t uuid := current_setting('test.t')::uuid; pos uuid; res jsonb; c uuid;
begin
  pos := (select id from public.channels where tenant_id = t and kind = 'pos');
  res := public.record_sale(t, pos, '[{"variant_id":"27000000-0000-4000-8000-000000000002","qty":2}]', 'hook-sale-1');
  perform public.void_sale((res ->> 'sale_id')::uuid, 'salah');
  reset role;
  insert into public.conversations (tenant_id, channel, external_user_id) values (t, 'widget', 'sess-27-aaaaaaaaaaaa') returning id into c;
  update public.conversations set status = 'escalated', escalation_reason = 'human_requested' where id = c;
  assert (select array_agg(type order by created_at) from public.outbox_events where tenant_id = t) = '{sale.created,sale.voided,chat.needs_owner}',
         'one event per change';
  assert (select (payload ->> 'total')::bigint from public.outbox_events where tenant_id = t and type = 'sale.created') = 200000, 'payload total';
  assert not exists (select 1 from public.outbox_events where payload::text ilike '%cost%'), 'no HPP in events';
  -- A rolled-back sale leaves no event.
  begin
    perform public.record_sale(t, pos, '[{"variant_id":"27000000-0000-4000-8000-000000000002","qty":1}]', 'hook-sale-2');
    raise exception 'rollback' using errcode = 'P0001';
  exception when raise_exception then null;
  end;
  assert (select count(*) from public.outbox_events where tenant_id = t and type = 'sale.created') = 1, 'no event from a rolled-back sale';
  assert public.queue_webhook_deliveries(t) = 3, 'fan-out';
  assert public.queue_webhook_deliveries(t) = 0, 'fan-out once';
end $$;

rollback;
\o
select 'webhooks: ok' as result;
