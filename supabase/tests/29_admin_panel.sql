-- Panel admin: only allowlisted, non-anonymous users pass; templates drive new demo shops.
\o /dev/null
begin;
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@wadar.test', false),
  ('00000000-0000-4000-8000-0000000000a2', 'bukan@wadar.test', false);
insert into app.platform_admins (email) values ('admin@wadar.test');

-- A non-admin can read templates but not change them or list shops.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2"}', true);
do $$ begin
  assert not public.is_platform_admin(), 'not admin';
  assert (select count(*) from public.demo_templates where on_juri) = 3, 'three on /juri';
  begin
    perform public.admin_save_demo_template('warkop', 'Hack', 'X', 'x', 'x', '☕', true);
    assert false, 'non-admin must not save';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.admin_list_shops('', 10);
    assert false, 'non-admin must not list';
  exception when insufficient_privilege then null; end;
end $$;

-- The admin renames the template; a new demo shop uses it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
do $$ begin
  assert public.is_platform_admin(), 'admin';
  perform public.admin_save_demo_template('warkop', 'Warkop Cak Rafi', 'Cak Rafi', 'Warkop', 'Kopi murah', '☕', true);
end $$;
select set_config('test.slug', public.create_demo_shop('warkop'), true);
do $$
declare t uuid;
begin
  select id into t from public.tenants where slug = current_setting('test.slug');
  assert (select name from public.tenants where id = t) = 'Warkop Cak Rafi', 'template name used';
  assert (select persona->>'name' from public.store_profile where tenant_id = t) = 'Cak Rafi', 'template owner used';
  assert exists (select 1 from public.admin_list_shops('cak rafi', 10) s where s.id = t and s.owner_email = 'admin@wadar.test'), 'listed';
  perform public.admin_rename_shop(t, 'Warkop Juri 1');
  assert (select name from public.tenants where id = t) = 'Warkop Juri 1', 'renamed';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where action = 'admin_rename_shop' and detail->>'to' = 'Warkop Juri 1'), 'shop audit';
  assert (select count(*) from app.admin_audit) >= 2, 'admin audit';
end $$;

-- Anonymous users never pass, even with an allowlisted email.
insert into auth.users (id, email, is_anonymous) values ('00000000-0000-4000-8000-0000000000a3', 'anon@wadar.test', true);
insert into app.platform_admins (email) values ('anon@wadar.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3"}', true);
do $$ begin assert not public.is_platform_admin(), 'anonymous is never admin'; end $$;
reset role;
rollback;
\o
select 'admin panel: ok' as result;
