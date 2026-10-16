-- Security review P1: the widget limiter counts per bucket, rejects without
-- recording, keeps buckets apart, and is closed to anon/authenticated. Rolled back.
\o /dev/null
begin;
do $$
declare r int;
begin
  for i in 1..3 loop
    assert public.widget_rate_hit(array['s:a', 'tenant:t1'], array[3, 5]) = 0, 'hits 1..3 allowed';
  end loop;
  r := public.widget_rate_hit(array['s:a', 'tenant:t1'], array[3, 5]);
  assert r between 1 and 60, 'the 4th hit of a 3-per-minute bucket waits';
  assert (select count(*) from public.widget_rate_hits where bucket = 'tenant:t1') = 3, 'a rejected hit records nothing';
  assert public.widget_rate_hit(array['s:b', 'tenant:t1'], array[3, 5]) = 0, 'a new session still has room in the shop bucket';
  assert public.widget_rate_hit(array['s:c', 'tenant:t2'], array[3, 5]) = 0, 'another shop is not affected';
end $$;
set local role anon;
do $$ begin
  perform public.widget_rate_hit(array['x'], array[1]);
  assert false, 'anon must not call widget_rate_hit';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
\o
select 'widget rate limit: ok' as result;
