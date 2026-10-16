-- Security review P5: "Coba demo" twice reopens the same demo shop instead of seeding another.
\o /dev/null
begin;
insert into auth.users (id, email, is_anonymous) values ('00000000-0000-4000-8000-0000000000e1', null, true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1"}', true);
select set_config('test.first', public.create_demo_shop('skincare'), true);
do $$ begin
  assert public.create_demo_shop('skincare') = current_setting('test.first'), 'same profile reopens the same shop';
end $$;
select set_config('test.kopi', public.create_demo_shop('kopi'), true);
reset role;
do $$ begin
  assert (select count(*) from public.tenants t join public.memberships m on m.tenant_id = t.id
           where m.user_id = '00000000-0000-4000-8000-0000000000e1' and t.is_demo) = 2, 'one demo per profile';
end $$;
rollback;
\o
select 'demo one per user: ok' as result;
