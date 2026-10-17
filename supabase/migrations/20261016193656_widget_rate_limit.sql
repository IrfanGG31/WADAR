-- Widget rate limit shared by every serverless instance (security review P1).
-- The cookie session alone could be dropped by the client, so each widget
-- message is counted in three buckets at once — session, client IP, whole shop
-- — before any conversation row is written. One call = atomic check-and-record:
-- the buckets are locked (sorted, no deadlock) so parallel requests cannot both
-- take the last slot. Only the service role (the widget route) may call it.

create table public.widget_rate_hits (
  bucket text not null,
  hit_at timestamptz not null default clock_timestamp()
);
create index widget_rate_hits_bucket_idx on public.widget_rate_hits (bucket, hit_at desc);
create index widget_rate_hits_time_idx on public.widget_rate_hits (hit_at);
alter table public.widget_rate_hits enable row level security;   -- no policies: service role only
revoke all on public.widget_rate_hits from public, anon, authenticated;

-- Returns 0 when allowed (and records one hit per bucket), else the seconds to wait.
create or replace function public.widget_rate_hit(p_buckets text[], p_limits int[], p_window_ms int default 60000)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_retry int := 0;
  v_oldest timestamptz;
  i int;
begin
  if coalesce(array_length(p_buckets, 1), 0) = 0 or array_length(p_buckets, 1) <> array_length(p_limits, 1) then
    raise exception 'widget_rate_hit: buckets and limits must have the same non-zero length';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('widget_rate:' || b, 0))
    from (select distinct b from unnest(p_buckets) as b order by b) s;

  for i in 1 .. array_length(p_buckets, 1) loop
    -- The limit-th newest hit inside the window: if it exists the bucket is full until it ages out.
    select h.hit_at into v_oldest
      from public.widget_rate_hits h
     where h.bucket = p_buckets[i] and h.hit_at > v_now - v_window
     order by h.hit_at desc
     offset greatest(p_limits[i] - 1, 0) limit 1;
    if found then
      v_retry := greatest(v_retry, 1, ceil(extract(epoch from (v_oldest + v_window - v_now)))::int);
    end if;
  end loop;
  if v_retry > 0 then
    return v_retry;
  end if;

  insert into public.widget_rate_hits (bucket, hit_at) select b, v_now from unnest(p_buckets) as b;
  delete from public.widget_rate_hits where hit_at < v_now - interval '10 minutes';
  return 0;
end $$;
revoke execute on function public.widget_rate_hit(text[], int[], int) from public, anon, authenticated;
grant execute on function public.widget_rate_hit(text[], int[], int) to service_role;
