-- GAP #5 — insight proaktif mingguan terjadwal (PDF Tabel 3, Misi 1). A Vercel Cron
-- (vercel.json, Monday 00.00 UTC = 07.00 WIB) calls /api/cron/weekly-insights, which stores
-- this week's insights in `insights` and one narrated digest per shop per week here.
-- (tenant_id, week_start) is unique, so re-running the job in the same week changes nothing.
-- The owner's "generate sekarang" button writes the same row (generated_by = 'manual').
-- delivery_status: email / WhatsApp are not configured yet → 'not_configured'.

create table public.weekly_insight_digests (
  id uuid primary key default app.uuid_v7(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  text text not null check (char_length(text) <= 4000),
  points jsonb not null default '[]' check (jsonb_typeof(points) = 'array'),
  insight_keys text[] not null default '{}',
  engine text not null check (engine in ('llm', 'offline')),
  model text not null check (char_length(model) <= 100),
  source text not null check (char_length(source) <= 40),
  generated_by text not null check (generated_by in ('cron', 'manual')),
  delivery_status text not null default 'not_configured' check (delivery_status in ('not_configured', 'sent', 'failed')),
  delivery_error text check (char_length(delivery_error) <= 300),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, week_start)
);

alter table public.weekly_insight_digests enable row level security;
create policy member_select on public.weekly_insight_digests for select to authenticated using (app.is_member(tenant_id));
create policy member_insert on public.weekly_insight_digests for insert to authenticated with check (app.is_member(tenant_id));

-- Owners read and (via the button) add this week's digest; delivery status is server-only.
revoke all on public.weekly_insight_digests from public, anon, authenticated;
grant select, insert on public.weekly_insight_digests to authenticated;
grant all on public.weekly_insight_digests to service_role;

-- The cron job has no user session: it reads each shop with the service role, which bypasses
-- RLS but failed stock_daily_series' membership check. Same function, the check is skipped
-- only when the caller's role is service_role (never reachable from a browser key).
create or replace function public.stock_daily_series(p_tenant_id uuid, p_days int default 56)
returns table (variant_id uuid, day date, opening int, sold int)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz text;
  v_today date;
begin
  if current_user <> 'service_role' then
    perform app.assert_member(p_tenant_id);
  end if;
  select timezone into v_tz from public.tenants where id = p_tenant_id;
  if v_tz is null then raise exception 'Toko tidak ditemukan' using errcode = 'P0002'; end if;
  v_today := ((now() at time zone v_tz)::date);

  return query
  with
    days as (
      select (v_today - gs)::date as d
      from generate_series(greatest(p_days, 1) - 1, 0, -1) gs
    ),
    vrows as (
      select v.id, v.on_hand as cur_on_hand from public.variants v where v.tenant_id = p_tenant_id
    ),
    mov as (
      select m.variant_id,
             ((m.occurred_at at time zone v_tz)::date) as mday,
             m.qty, m.kind
      from public.stock_movements m
      where m.tenant_id = p_tenant_id
    ),
    net_from as (
      -- net qty with occurred_at::date >= d
      select vr.id as variant_id, d.d,
             coalesce((select sum(mv.qty) from mov mv where mv.variant_id = vr.id and mv.mday >= d.d), 0) as net_after,
             coalesce((select -sum(mv.qty) from mov mv
                        where mv.variant_id = vr.id and mv.mday = d.d and mv.kind = 'sale'), 0) as sold
      from vrows vr cross join days d
    )
  select nf.variant_id,
         nf.d as day,
         (vr.cur_on_hand - nf.net_after)::int as opening,
         nf.sold::int as sold
  from net_from nf
  join vrows vr on vr.id = nf.variant_id
  order by nf.variant_id, nf.d;
end $$;

grant execute on function public.stock_daily_series(uuid, int) to authenticated, service_role;
