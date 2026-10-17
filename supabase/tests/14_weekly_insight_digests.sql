-- GAP #5: one digest per shop per week (re-insert is a no-op), members read their own shop's
-- digests only, delivery status is server-only, and the cron's service role may read
-- stock_daily_series while a non-member still may not.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.local'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1"}', true);
select public.create_shop('Toko Mingguan', 'toko-mingguan', 'kecantikan');

do $$
declare t uuid; n int;
begin
  t := (select id from public.tenants where slug = 'toko-mingguan');
  insert into public.weekly_insight_digests (tenant_id, week_start, text, points, engine, model, source, generated_by)
  values (t, '2026-10-19', 'Ringkasan', '["a"]', 'offline', 'offline:template-v1', 'offline', 'manual');
  -- Same week again: the job's insert-if-absent keeps the first row.
  insert into public.weekly_insight_digests (tenant_id, week_start, text, engine, model, source, generated_by)
  values (t, '2026-10-19', 'Dobel', 'offline', 'offline:template-v1', 'offline', 'cron')
  on conflict (tenant_id, week_start) do nothing;
  assert (select count(*) from public.weekly_insight_digests where tenant_id = t) = 1, 'one digest per week';
  assert (select text from public.weekly_insight_digests where tenant_id = t) = 'Ringkasan';

  -- week_start must be a Monday.
  begin
    insert into public.weekly_insight_digests (tenant_id, week_start, text, engine, model, source, generated_by)
    values (t, '2026-10-20', 'Selasa', 'offline', 'm', 'offline', 'cron');
    raise exception 'non-Monday week accepted';
  exception when check_violation then null;
  end;

  -- Owners cannot rewrite delivery status.
  begin
    update public.weekly_insight_digests set delivery_status = 'sent' where tenant_id = t;
    raise exception 'owner updated delivery status';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.stock_daily_series(t, 7);
  assert n = 0, 'member reads the (empty) series';
end $$;

-- Another user sees nothing and can't read the shop's stock series.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1"}', true);
do $$ begin
  assert (select count(*) from public.weekly_insight_digests) = 0, 'digests are tenant-scoped';
end $$;
reset role;
do $$ declare t uuid := (select id from public.tenants where slug = 'toko-mingguan'); begin
  set local role authenticated;
  begin
    perform * from public.stock_daily_series(t, 7);
    raise exception 'non-member read stock series';
  exception when insufficient_privilege then null;
  end;
  reset role;
  -- The cron (service role, no user) may.
  set local role service_role;
  perform * from public.stock_daily_series(t, 7);
  update public.weekly_insight_digests set delivery_status = 'not_configured' where tenant_id = t;
  reset role;
end $$;
rollback;
\o
select 'weekly insight digests: ok' as result;
