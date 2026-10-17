-- STK-5: variants.expires_on is optional, the owner can set/clear it, a cashier cannot,
-- and nothing else about the variant row becomes writable.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000021a1', 'owner@test.local'),
  ('00000000-0000-4000-8000-0000000021b1', 'kasir@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000021a1"}', true);
select set_config('test.t', (public.create_shop('Toko Exp', 'toko-exp', 'kecantikan')).id::text, true);
insert into public.products (id, tenant_id, name)
  values ('21000000-0000-4000-8000-000000000001', current_setting('test.t')::uuid, 'Serum');
insert into public.variants (id, tenant_id, product_id, price)
  values ('21000000-0000-4000-8000-000000000002', current_setting('test.t')::uuid,
          '21000000-0000-4000-8000-000000000001', 100000);
do $$
begin
  assert (select expires_on from public.variants where id = '21000000-0000-4000-8000-000000000002') is null, 'optional';
  update public.variants set expires_on = '2026-11-01' where id = '21000000-0000-4000-8000-000000000002';
  assert (select expires_on from public.variants where id = '21000000-0000-4000-8000-000000000002') = '2026-11-01', 'owner sets';
  update public.variants set expires_on = null where id = '21000000-0000-4000-8000-000000000002';
  assert (select expires_on from public.variants where id = '21000000-0000-4000-8000-000000000002') is null, 'owner clears';
  begin
    update public.variants set on_hand = 99 where id = '21000000-0000-4000-8000-000000000002';
    raise exception 'on_hand became writable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
insert into public.memberships (tenant_id, user_id, role)
  values (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000021b1', 'cashier');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000021b1"}', true);
-- RLS (owner-only update) filters the row out: no error, nothing changes.
update public.variants set expires_on = '2026-12-01' where id = '21000000-0000-4000-8000-000000000002';
reset role;
do $$
begin
  assert (select expires_on from public.variants where id = '21000000-0000-4000-8000-000000000002') is null, 'cashier cannot set';
end $$;
rollback;
\o
select 'variant expiry: ok' as result;
