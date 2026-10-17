-- GAP #6: delete_my_account removes only the caller's app data, refuses while they are the
-- last owner of a real shop (nothing touched), deletes demo shops only they own, and queues
-- the auth.users deletion in account_deletions (service role only).
\o /dev/null
begin;
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-8000-0000000019a1', 'owner@test.local', false),
  ('00000000-0000-4000-8000-0000000019b1', 'kasir@test.local', false),
  ('00000000-0000-4000-8000-0000000019d1', 'pemilik2@test.local', false),
  ('00000000-0000-4000-8000-0000000019e1', null, true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000019a1"}', true);
select set_config('test.t', (public.create_shop('Toko Akun', 'toko-akun', 'kecantikan')).id::text, true);
reset role;
insert into public.memberships (tenant_id, user_id, role) values
  (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000019b1', 'cashier');
insert into public.shop_invites (tenant_id, email, role, token) values
  (current_setting('test.t')::uuid, 'kasir@test.local', 'chat_admin', repeat('k', 40));
insert into public.tenants (id, name, slug, is_demo) values
  ('19000000-0000-4000-8000-000000000001', 'Glow Demo', 'glow-by-sari-zz1', true);
insert into public.memberships (tenant_id, user_id, role) values
  ('19000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000019e1', 'owner');
set local role authenticated;

-- No session: refused.
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  begin
    perform public.delete_my_account('hapus');
    raise exception 'deleted without a session';
  exception when invalid_authorization_specification then null;
  end;
end $$;

-- The last owner of a real shop is refused with the shop listed; nothing changes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000019a1"}', true);
do $$
declare res jsonb;
begin
  begin
    perform public.delete_my_account('orang-lain@test.local');
    raise exception 'wrong confirmation accepted';
  exception when invalid_parameter_value then null;
  end;
  res := public.delete_my_account(' Owner@Test.Local ');
  assert (res->>'deleted')::boolean = false, format('last owner refused, got %s', res);
  assert res->'blocked_shops' = '[{"slug":"toko-akun","name":"Toko Akun"}]'::jsonb, format('blocked list, got %s', res);
  assert (select count(*) from public.memberships where tenant_id = current_setting('test.t')::uuid) = 2, 'memberships untouched';
  begin
    perform 1 from public.account_deletions;
    raise exception 'member read account_deletions';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A cashier leaves: own membership + open invite gone, the shop and its owner stay.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000019b1"}', true);
do $$
declare res jsonb;
begin
  res := public.delete_my_account('KASIR@test.local');
  assert (res->>'deleted')::boolean and (res->>'left_shops')::int = 1, format('cashier deleted, got %s', res);
  assert (select count(*) from public.memberships) = 0, 'cashier sees no shop any more';
end $$;

-- With a second owner the first owner may leave.
reset role;
do $$ begin
  assert (select count(*) from public.memberships where user_id = '00000000-0000-4000-8000-0000000019b1') = 0, 'cashier membership gone';
  assert (select count(*) from public.shop_invites where email = 'kasir@test.local') = 0, 'open invite gone';
  assert (select count(*) from public.account_deletions where user_id = '00000000-0000-4000-8000-0000000019b1') = 1, 'auth deletion queued';
  assert (select count(*) from auth.users where id = '00000000-0000-4000-8000-0000000019b1') = 1, 'auth.users untouched';
end $$;
insert into public.memberships (tenant_id, user_id, role) values
  (current_setting('test.t')::uuid, '00000000-0000-4000-8000-0000000019d1', 'owner');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000019a1"}', true);
do $$
declare res jsonb;
begin
  res := public.delete_my_account('owner@test.local');
  assert (res->>'deleted')::boolean, format('owner with co-owner deleted, got %s', res);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.tenants where slug = 'toko-akun') = 1, 'shop kept';
  assert (select role from public.memberships where user_id = '00000000-0000-4000-8000-0000000019d1') = 'owner', 'co-owner kept';
end $$;

-- An anonymous demo user (no email) confirms with HAPUS; their demo shop goes too.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000019e1"}', true);
do $$
declare res jsonb;
begin
  res := public.delete_my_account('HAPUS');
  assert (res->>'deleted')::boolean and (res->>'deleted_demo_shops')::int = 1, format('demo user deleted, got %s', res);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.tenants where id = '19000000-0000-4000-8000-000000000001') = 0, 'demo shop deleted';
end $$;
rollback;
\o
select 'account deletion: ok' as result;
