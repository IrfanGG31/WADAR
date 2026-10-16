-- GAP #10: the shared answer cache is tenant-isolated like every tenant table. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000e2', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1"}', true);
select public.create_shop('Toko A', 'toko-a-cache', 'fnb');
insert into public.ai_answer_cache (tenant_id, cache_key, value, expires_at)
  select id, 'weekly|a|k', '{"text":"A"}', now() + interval '1 hour' from public.tenants where slug = 'toko-a-cache';
-- upsert by the owner (insert … on conflict do update) works
insert into public.ai_answer_cache (tenant_id, cache_key, value, expires_at)
  select id, 'weekly|a|k', '{"text":"A2"}', now() + interval '2 hours' from public.tenants where slug = 'toko-a-cache'
  on conflict (tenant_id, cache_key) do update set value = excluded.value, expires_at = excluded.expires_at;
do $$ begin
  assert (select value->>'text' from public.ai_answer_cache where cache_key = 'weekly|a|k') = 'A2', 'owner upsert';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2"}', true);
select public.create_shop('Toko B', 'toko-b-cache', 'fnb');
do $$ begin
  assert (select count(*) from public.ai_answer_cache) = 0, 'another owner must not read shop A''s cache';
end $$;
do $$ begin
  insert into public.ai_answer_cache (tenant_id, cache_key, value, expires_at)
  select id, 'weekly|x|k', '{}', now() from public.tenants where slug = 'toko-a-cache';
  assert false, 'writing into another shop''s cache must fail';
exception when insufficient_privilege then null;
end $$;

set local role anon;
do $$ begin
  perform 1 from public.ai_answer_cache;
  assert false, 'anon must not read the cache';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
\o
select 'ai answer cache: ok' as result;
