-- D7 Konsultasi: memory_items and insights are tenant-isolated, memory is insert-only for the app,
-- insights only allow a status change, and the same insight may return in a later week. Rolled back.
\o /dev/null
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'sari@test.local'),
  ('00000000-0000-4000-8000-0000000000e2', 'dimas@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1"}', true);
select public.create_shop('Toko Sari E', 'toko-sari-e', 'fesyen');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2"}', true);
select public.create_shop('Toko Dimas E', 'toko-dimas-e', 'fnb');
reset role;

do $$
declare a uuid := (select id from public.tenants where slug = 'toko-sari-e');
        b uuid := (select id from public.tenants where slug = 'toko-dimas-e');
        n int;
begin
  -- Owner A writes memory + an insight.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1"}', true);
  set local role authenticated;
  insert into public.memory_items (tenant_id, kind, content, source) values (a, 'preference', 'Jangan pernah diskon di atas 15%', 'consult');
  insert into public.insights (tenant_id, engine, type, severity, title, body, evidence, dedupe_key, period_start)
    values (a, 'consult', 'slow_mover', 2, 't', 'b', '{}', 'slow_mover:x', '2026-10-12');
  -- Same key, later week: allowed. Same key, same week: rejected.
  insert into public.insights (tenant_id, engine, type, severity, title, body, evidence, dedupe_key, period_start)
    values (a, 'consult', 'slow_mover', 2, 't', 'b', '{}', 'slow_mover:x', '2026-10-19');
  begin
    insert into public.insights (tenant_id, engine, type, severity, title, body, evidence, dedupe_key, period_start)
      values (a, 'consult', 'slow_mover', 2, 't', 'b', '{}', 'slow_mover:x', '2026-10-19');
    raise exception 'duplicate insight accepted';
  exception when unique_violation then null;
  end;
  -- Status may change; content may not; memory has no UPDATE/DELETE.
  update public.insights set status = 'seen' where tenant_id = a;
  begin update public.insights set title = 'hacked' where tenant_id = a; raise exception 'title updated';
  exception when insufficient_privilege then null; end;
  begin update public.memory_items set content = 'x' where tenant_id = a; raise exception 'memory updated';
  exception when insufficient_privilege then null; end;
  begin delete from public.memory_items where tenant_id = a; raise exception 'memory deleted';
  exception when insufficient_privilege then null; end;
  -- Writing into someone else's shop is refused.
  begin
    insert into public.memory_items (tenant_id, content) values (b, 'bukan punyaku');
    raise exception 'cross-tenant insert';
  exception when insufficient_privilege or check_violation then null;
  end;
  reset role;

  -- Owner B sees none of A's rows.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2"}', true);
  set local role authenticated;
  select count(*) into n from public.memory_items; assert n = 0, 'B sees no memory of A';
  select count(*) into n from public.insights; assert n = 0, 'B sees no insights of A';
  reset role;
end $$;
rollback;
\o
select 'consult: ok';
