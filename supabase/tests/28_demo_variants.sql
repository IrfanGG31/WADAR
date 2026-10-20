-- Ruang Demo: the three segment demos (warkop, penyetan, madura) are small, consistent, and reopenable.
\o /dev/null
begin;
insert into auth.users (id, email, is_anonymous) values ('00000000-0000-4000-8000-0000000000f1', null, true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1"}', true);
select set_config('test.warkop', public.create_demo_shop('warkop'), true);
select set_config('test.penyetan', public.create_demo_shop('penyetan'), true);
select set_config('test.madura', public.create_demo_shop('madura'), true);
do $$ begin
  assert public.create_demo_shop('madura') = current_setting('test.madura'), 'same profile reopens the same shop';
  assert current_setting('test.warkop') like 'warkop-mas-bayu-%', 'warkop slug';
  assert (select count(*) from public.my_demo_shops()) = 3, 'my_demo_shops lists the three';
end $$;
reset role;
do $$
declare t public.tenants; n_products int; n_sales int;
begin
  for t in select * from public.tenants where slug in (current_setting('test.warkop'), current_setting('test.penyetan'), current_setting('test.madura')) loop
    assert app.demo_profile(t) in ('warkop', 'penyetan', 'madura'), 'profile stored';
    select count(*) into n_products from public.products where tenant_id = t.id;
    assert n_products between 8 and 10, format('%s: small catalog, got %s', t.name, n_products);
    select count(*) into n_sales from public.sales where tenant_id = t.id;
    assert n_sales between 300 and 3000, format('%s: sales %s', t.name, n_sales);
    assert not exists (select 1 from public.sales where tenant_id = t.id and occurred_at < now() - interval '31 days'), '30 days only';
    assert not exists (select 1 from public.sales where tenant_id = t.id and occurred_at > now()), 'no future sales';
    assert not exists (select 1 from public.variants v where v.tenant_id = t.id and
      v.on_hand <> (select coalesce(sum(qty), 0) from public.stock_movements m where m.variant_id = v.id)), 'on_hand = Σ movements';
    assert not exists (select 1 from public.variants where tenant_id = t.id and on_hand < 0), 'no negative stock';
    assert not exists (
      select 1 from public.sales s
        join (select sale_id, sum(alloc_order_discount) d, sum(alloc_platform_fee) f, sum(qty * unit_price - line_discount) g
                from public.sale_items group by sale_id) i on i.sale_id = s.id
       where s.tenant_id = t.id and (i.d <> s.order_discount or i.f <> s.platform_fee or i.g <> s.subtotal
                                     or s.total <> s.subtotal - s.order_discount)), 'allocations sum to sale totals';
    assert (select count(*) from public.expenses where tenant_id = t.id) >= 8, 'weekly expenses';
    assert (select count(*) from public.kb_documents where tenant_id = t.id and kind = 'faq') = 3, 'faq seeded';
  end loop;
  -- Warung Madura: open 24 hours, and Gas LPG is the one item running low.
  select * into t from public.tenants where slug = current_setting('test.madura');
  assert exists (select 1 from public.sales where tenant_id = t.id and extract(hour from occurred_at at time zone t.timezone) < 5), 'night sales';
  assert (select v.on_hand from public.variants v join public.products p on p.id = v.product_id
           where p.tenant_id = t.id and p.name = 'Gas LPG 3kg') < 16, 'gas runs low';
  -- Penyetan: this week GoFood carries the promo.
  select * into t from public.tenants where slug = current_setting('test.penyetan');
  assert (select count(*) from public.sales s join public.channels c on c.id = s.channel_id
           where s.tenant_id = t.id and c.kind = 'gofood' and s.order_discount > 0
             and s.occurred_at > now() - interval '7 days') > 20, 'GoFood promo week';
  -- Reset keeps the profile.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1"}', true);
end $$;
set local role authenticated;
select set_config('test.reset', public.reset_demo_shop((select id from public.tenants where slug = current_setting('test.warkop'))), true);
reset role;
do $$ begin
  assert (select name from public.tenants where slug = current_setting('test.reset')) = 'Warkop Mas Bayu', 'reset keeps the warkop profile';
end $$;
rollback;
\o
select 'demo variants: ok' as result;
