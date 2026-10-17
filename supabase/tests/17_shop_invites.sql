-- TEAM-1: owner invites (link, no email), the invited email accepts, owner changes the
-- role and revokes access. Non-owners and other emails are refused.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000017a1', 'owner@test.local'),
  ('00000000-0000-4000-8000-0000000017b1', 'kasir@test.local'),
  ('00000000-0000-4000-8000-0000000017c1', 'lain@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000017a1"}', true);
select set_config('test.t', (public.create_shop('Toko Tim', 'toko-tim', 'fnb')).id::text, true);

-- owner invites; owner role cannot be invited; bad email refused
select set_config('test.token', (public.create_shop_invite(current_setting('test.t')::uuid, ' Kasir@Test.local ', 'cashier')).token, true);
do $$
declare t uuid := current_setting('test.t')::uuid; first_token text := current_setting('test.token');
begin
  assert (select email from public.shop_invites where token = first_token) = 'kasir@test.local', 'email normalised';
  assert length(first_token) = 64, 'long random token';
  begin
    perform public.create_shop_invite(t, 'x@test.local', 'owner');
    assert false, 'owner role is not invitable';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_shop_invite(t, 'bukan-email', 'cashier');
    assert false, 'bad email refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_shop_invite(t, 'owner@test.local', 'cashier');
    assert false, 'an existing member is not re-invited';
  exception when unique_violation then null;
  end;
  -- re-inviting the same email revokes the older link
  perform public.create_shop_invite(t, 'kasir@test.local', 'chat_admin');
  assert (select revoked_at is not null from public.shop_invites where token = first_token), 'old invite revoked';
  assert (select count(*) from public.shop_invites where tenant_id = t and revoked_at is null) = 1, 'one open invite';
  -- back to a cashier invite for the rest of the test
  select token into first_token from public.create_shop_invite(t, 'kasir@test.local', 'cashier');
  perform set_config('test.token', first_token, true);
end $$;

-- another email cannot accept; a stranger cannot list, invite or change roles
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000017c1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  assert (select status from public.shop_invite_preview(current_setting('test.token'))) = 'open', 'preview open';
  begin
    perform public.accept_shop_invite(current_setting('test.token'));
    assert false, 'another email must not accept';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_shop_members(t);
    assert false, 'stranger must not list members';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.shop_invites where tenant_id = t) = 0, 'stranger sees no invites';
end $$;

-- the invited email accepts and becomes a cashier
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000017b1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  assert public.accept_shop_invite(current_setting('test.token')) = 'toko-tim', 'accept returns the slug';
  assert public.accept_shop_invite(current_setting('test.token')) = 'toko-tim', 'accepting twice is harmless';
  assert app.has_shop_role(t, '{cashier}'), 'now a cashier';
  -- a cashier cannot manage the team
  begin
    perform public.create_shop_invite(t, 'baru@test.local', 'cashier');
    assert false, 'cashier must not invite';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_member_role(t, '00000000-0000-4000-8000-0000000017b1', 'owner');
    assert false, 'cashier must not promote themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_shop_member(t, '00000000-0000-4000-8000-0000000017a1');
    assert false, 'cashier must not remove the owner';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_shop_members(t);
    assert false, 'cashier must not list member emails';
  exception when insufficient_privilege then null;
  end;
end $$;

-- the owner lists, changes the role, cannot touch themselves, revokes access
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000017a1"}', true);
do $$
declare t uuid := current_setting('test.t')::uuid;
begin
  assert (select count(*) from public.list_shop_members(t)) = 2, 'owner + cashier';
  assert (select is_me from public.list_shop_members(t) where role = 'owner'), 'owner row is me';
  perform public.set_member_role(t, '00000000-0000-4000-8000-0000000017b1', 'chat_admin');
  assert (select role from public.list_shop_members(t) where email = 'kasir@test.local') = 'chat_admin', 'role changed';
  begin
    perform public.set_member_role(t, '00000000-0000-4000-8000-0000000017a1', 'cashier');
    assert false, 'owner must not demote themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_shop_member(t, '00000000-0000-4000-8000-0000000017a1');
    assert false, 'owner must not remove themselves';
  exception when insufficient_privilege then null;
  end;
  perform public.remove_shop_member(t, '00000000-0000-4000-8000-0000000017b1');
  assert (select count(*) from public.list_shop_members(t)) = 1, 'access revoked';
  -- invite revoke
  perform public.revoke_shop_invite(t, (public.create_shop_invite(t, 'lain@test.local', 'cashier')).id);
  assert not exists (select 1 from public.shop_invites where tenant_id = t and email = 'lain@test.local' and revoked_at is null), 'invite revoked';
end $$;

-- an unknown token cannot be accepted
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000017c1"}', true);
do $$ begin
  assert not exists (select 1 from public.shop_invite_preview('token-yang-tidak-ada')), 'unknown token previews nothing';
  perform public.accept_shop_invite('token-yang-tidak-ada');
  assert false, 'unknown token refused';
exception when no_data_found then null;
end $$;

reset role;
rollback;
\o
select 'shop invites: ok' as result;
