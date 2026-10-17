-- D7 Konsultasi: memory_items and insights are tenant-isolated, the owner may edit the text of /
-- delete own memory (CON-4) but never another shop's,
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
  -- Status may change; content may not.
  update public.insights set status = 'seen' where tenant_id = a;
  begin update public.insights set title = 'hacked' where tenant_id = a; raise exception 'title updated';
  exception when insufficient_privilege then null; end;
  -- CON-4: memory text may be edited, other columns not; the check constraint still applies.
  update public.memory_items set content = 'Diskon maksimal 10%' where tenant_id = a;
  assert (select content from public.memory_items where tenant_id = a) = 'Diskon maksimal 10%', 'memory edited';
  begin update public.memory_items set tenant_id = b where tenant_id = a; raise exception 'memory moved';
  exception when insufficient_privilege then null; end;
  begin update public.memory_items set content = 'x' where tenant_id = a; raise exception 'short memory accepted';
  exception when check_violation then null; end;
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
  -- B cannot edit or delete A's memory (RLS hides the rows: 0 affected).
  update public.memory_items set content = 'dibajak' where tenant_id = a;
  delete from public.memory_items where tenant_id = a;
  select count(*) into n from public.insights; assert n = 0, 'B sees no insights of A';
  reset role;
  assert (select content from public.memory_items where tenant_id = a) = 'Diskon maksimal 10%', 'A memory untouched by B';

  -- A deletes own memory.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1"}', true);
  set local role authenticated;
  delete from public.memory_items where tenant_id = a;
  select count(*) into n from public.memory_items; assert n = 0, 'A deleted own memory';
  reset role;
end $$;
rollback;
\o
select 'consult: ok';
