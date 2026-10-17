-- ONB-3 / D2 DoD: the demo generator produces consistent data that tells the demo story.
\o /dev/null
begin;
insert into auth.users (id, email, is_anonymous) values ('00000000-0000-4000-8000-0000000000d1', null, true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1"}', true);
select public.create_demo_shop('skincare');
select public.create_demo_shop('kopi');
reset role;
do $$
declare t uuid; serum record; slow_last timestamptz; tz text := 'Asia/Jakarta';
begin
  for t in select id from public.tenants where is_demo loop
    assert (select count(*) from public.sales where tenant_id = t) > 1500, 'enough sales';
    -- Stock projection is exact and never negative.
    assert not exists (select 1 from public.variants v where v.tenant_id = t and
      v.on_hand <> (select coalesce(sum(qty), 0) from public.stock_movements m where m.variant_id = v.id)), 'on_hand = Σ movements';
    assert not exists (select 1 from public.variants where tenant_id = t and on_hand < 0), 'no negative stock';
    -- Every sale's allocations add up and totals are consistent.
    assert not exists (
      select 1 from public.sales s
        join (select sale_id, sum(alloc_order_discount) d, sum(alloc_platform_fee) f,
                     sum(qty * unit_price - line_discount) g
                from public.sale_items group by sale_id) i on i.sale_id = s.id
       where s.tenant_id = t and (i.d <> s.order_discount or i.f <> s.platform_fee or i.g <> s.subtotal
                                  or s.total <> s.subtotal - s.order_discount)), 'allocations sum to sale totals';
    assert not exists (select 1 from public.sales where tenant_id = t and occurred_at > now()), 'no future sales';
    assert (select count(*) from public.expenses where tenant_id = t) > 20, 'expenses seeded';
  end loop;

  t := (select id from public.tenants where name = 'Glow by Sari');
  select v.on_hand, v.lead_time_days into serum from public.variants v join public.products p on p.id = v.product_id
   where p.tenant_id = t and p.name = 'Serum Vit C 20ml';
  assert serum.on_hand = 7, format('Serum Vit C ends at 7, got %s', serum.on_hand);
  select max(s.occurred_at) into slow_last from public.sale_items i join public.sales s on s.id = i.sale_id
   where i.tenant_id = t and i.name_snapshot = 'Hair Mist 100ml';
  assert slow_last < now() - interval '30 days', 'Hair Mist has not sold for 30 days';
  assert (select on_hand from public.variants v join public.products p on p.id = v.product_id
           where p.tenant_id = t and p.name = 'Hair Mist 100ml') > 10, 'Hair Mist still has stock';
  -- Keuangan's story (SPRINT-8D §4 step 4) over the 7 closed days vs the 7 before:
  -- more discount, a bigger TikTok share, the same weekly expenses.
  declare
    today date := (now() at time zone tz)::date;
    w1_from date := today - 7; w0_from date := today - 14;
  begin
    assert (select sum(order_discount) from public.sales where tenant_id = t
             and (occurred_at at time zone tz)::date between w1_from and today - 1)
         > 3 * (select sum(order_discount) from public.sales where tenant_id = t
             and (occurred_at at time zone tz)::date between w0_from and w1_from - 1), 'discounts jump in the story week';
    assert (select avg((c.kind = 'tiktok_shop')::int) from public.sales s join public.channels c on c.id = s.channel_id
             where s.tenant_id = t and (s.occurred_at at time zone tz)::date between w1_from and today - 1)
         > 0.4, 'TikTok carries the story week';
    assert (select sum(amount) from public.expenses where tenant_id = t and occurred_at between w1_from and today - 1)
         = (select sum(amount) from public.expenses where tenant_id = t and occurred_at between w0_from and w1_from - 1),
           'weekly expenses: no date-dependent bill in a 7-day comparison';
  end;
  -- A 4-day lead time makes the last 7 Serum (≈3 days of sales) read as kritis on Prediksi.
  assert serum.lead_time_days = 4, 'Serum lead time';
end $$;

-- Reset builds a fresh copy under the same slug and archives the old shop (nothing deleted);
-- real shops can't be reset.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1"}', true);
create temp table reset_result as
  select public.reset_demo_shop((select id from public.tenants where name = 'Glow by Sari')) as slug;
select public.create_shop('Toko Asli', 'toko-asli', 'fesyen');
do $$ begin
  begin
    perform public.reset_demo_shop((select id from public.tenants where slug = 'toko-asli'));
    raise exception 'reset a real shop';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
declare v_slug text := (select slug from reset_result);
begin
  assert (select count(*) from public.tenants where slug = v_slug) = 1, 'same slug, one live shop';
  assert (select count(*) from public.tenants where name = 'Glow by Sari (arsip)') = 1, 'old shop archived';
  assert (select on_hand from public.variants v join public.products p on p.id = v.product_id
           join public.tenants t on t.id = p.tenant_id
          where t.slug = v_slug and p.name = 'Serum Vit C 20ml') = 7, 'reset keeps the story';
end $$;
rollback;
\o
select 'demo_seed: ok' as result;
