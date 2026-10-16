-- Security review P3: an owner cannot put a reply into another shop's conversation,
-- even with their own tenant_id on the row. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000d1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000d2', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1"}', true);
select public.create_shop('Toko A', 'toko-a-fk', 'fnb');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2"}', true);
select public.create_shop('Toko B', 'toko-b-fk', 'fnb');
reset role;
select set_config('request.jwt.claims', '{}', true);
insert into public.conversations (tenant_id, channel, external_user_id)
  select id, 'widget', 'visitor-b-0000000000000000' from public.tenants where slug = 'toko-b-fk';
-- The id leaks to the attacker in this scenario; RLS would hide the row itself from them.
select set_config('test.conv_b', (select id::text from public.conversations where external_user_id = 'visitor-b-0000000000000000'), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1"}', true);
do $$ begin
  insert into public.messages (tenant_id, conversation_id, direction, author, content)
  select (select id from public.tenants where slug = 'toko-a-fk'),
         current_setting('test.conv_b')::uuid,
         'out', 'human', 'nyasar';
  assert false, 'a reply into another shop''s conversation must fail';
exception when foreign_key_violation then null;
end $$;
reset role;
rollback;
\o
select 'messages tenant fk: ok' as result;
