-- GAP #6: hapus toko bertahap. Owner schedules (soft-delete), can cancel, then purges;
-- purge removes every row of the shop. Another member / another owner cannot.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000f2', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1"}', true);
select set_config('test.t', (public.create_shop('Toko Hapus', 'toko-hapus', 'fnb')).id::text, true);
insert into public.customers (tenant_id, name) values (current_setting('test.t')::uuid, 'Rina');
insert into public.expenses (tenant_id, category, amount, occurred_at) values (current_setting('test.t')::uuid, 'Iklan', 5000, current_date);

-- wrong confirmation: nothing changes
do $$ begin
  perform public.request_shop_deletion(current_setting('test.t')::uuid, 'toko-lain');
  assert false, 'wrong slug must be refused';
exception when invalid_parameter_value then null;
end $$;
-- purge before scheduling is refused
do $$ begin
  perform public.purge_shop(current_setting('test.t')::uuid, 'toko-hapus');
  assert false, 'purge needs a scheduled deletion first';
exception when object_not_in_prerequisite_state then null;
end $$;
-- the owner cannot set the deletion columns directly
do $$ begin
  update public.tenants set purge_after = now() where id = current_setting('test.t')::uuid;
  assert false, 'deletion columns are function-only';
exception when insufficient_privilege then null;
end $$;

-- stage 1: soft-delete marks the shop, data stays
do $$ declare v timestamptz; begin
  v := public.request_shop_deletion(current_setting('test.t')::uuid, ' Toko-Hapus ');
  assert v > now() + interval '6 days', 'purge scheduled after the grace period';
  assert (select deletion_requested_at is not null from public.tenants where id = current_setting('test.t')::uuid), 'marked';
  assert (select count(*) from public.customers where tenant_id = current_setting('test.t')::uuid) = 1, 'data kept';
end $$;
-- cancel clears the mark
select public.cancel_shop_deletion(current_setting('test.t')::uuid);
do $$ begin
  assert (select deletion_requested_at is null and purge_after is null from public.tenants where id = current_setting('test.t')::uuid), 'cancelled';
end $$;
select public.request_shop_deletion(current_setting('test.t')::uuid, 'toko-hapus');

-- another user cannot schedule, cancel or purge it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2"}', true);
do $$ begin
  perform public.purge_shop(current_setting('test.t')::uuid, 'toko-hapus');
  assert false, 'a stranger must not purge';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.cancel_shop_deletion(current_setting('test.t')::uuid);
  assert false, 'a stranger must not cancel';
exception when insufficient_privilege then null;
end $$;

-- stage 2: the owner purges; every tenant row is gone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1"}', true);
select public.purge_shop(current_setting('test.t')::uuid, 'toko-hapus');
reset role;
do $$ begin
  assert not exists (select 1 from public.tenants where id = current_setting('test.t')::uuid), 'tenant deleted';
  assert not exists (select 1 from public.customers where tenant_id = current_setting('test.t')::uuid), 'customers deleted';
  assert not exists (select 1 from public.expenses where tenant_id = current_setting('test.t')::uuid), 'expenses deleted';
  assert not exists (select 1 from public.channels where tenant_id = current_setting('test.t')::uuid), 'channels deleted';
  assert not exists (select 1 from public.memberships where tenant_id = current_setting('test.t')::uuid), 'memberships deleted';
end $$;

-- purge_due_shops: service role only, removes shops past their grace period
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2"}', true);
select set_config('test.t2', (public.create_shop('Toko Lewat', 'toko-lewat', 'fnb')).id::text, true);
select public.request_shop_deletion(current_setting('test.t2')::uuid, 'toko-lewat');
do $$ begin
  perform public.purge_due_shops();
  assert false, 'app users must not run the purge job';
exception when insufficient_privilege then null;
end $$;
reset role;
update public.tenants set deletion_requested_at = now() - interval '8 days', purge_after = now() - interval '1 day'
 where id = current_setting('test.t2')::uuid;
set local role service_role;
do $$ begin
  assert public.purge_due_shops() >= 1, 'due shop purged';
  assert not exists (select 1 from public.tenants where id = current_setting('test.t2')::uuid), 'gone';
end $$;
reset role;
rollback;
\o
select 'shop deletion: ok' as result;
