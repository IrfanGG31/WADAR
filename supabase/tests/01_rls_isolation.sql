-- RLS isolation (SEC-1, D1 DoD): a member of shop B can't read or write shop A.
-- Runs in one transaction that is rolled back.
\o /dev/null
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'sari@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'dimas@test.local');

set local role authenticated;

-- Sari creates shop A and a product.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a"}', true);
select public.create_shop('Toko A', 'toko-a', 'kecantikan');
insert into public.products (tenant_id, name)
  select id, 'Serum Vit C' from public.tenants where slug = 'toko-a';
insert into public.variants (tenant_id, product_id, price)
  select p.tenant_id, p.id, 89000 from public.products p;

do $$ begin
  assert (select count(*) from public.channels) = 5, 'create_shop seeds 5 default channels';
  assert (select count(*) from public.memberships) = 1, 'owner membership created';
  assert (select count(*) from public.store_profile) = 1, 'store profile created';
end $$;

-- Dimas creates shop B, then tries to see / touch shop A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b"}', true);
select public.create_shop('Toko B', 'toko-b', 'fnb');

do $$
declare a_id uuid;
begin
  assert (select count(*) from public.tenants) = 1, 'B sees only its own tenant';
  assert (select count(*) from public.products) = 0, 'B cannot read A products';
  assert (select count(*) from public.variants) = 0, 'B cannot read A variants';
  assert (select count(*) from public.channels) = 5, 'B sees only its own 5 channels';
  assert (select count(*) from public.memberships) = 1, 'B sees only its own membership';

  a_id := (select id from public.tenants where slug = 'toko-a');   -- invisible → null
  assert a_id is null, 'A tenant row is invisible to B';
end $$;

-- Writing into A with A's id must be rejected by WITH CHECK.
do $$
declare a_id uuid;
begin
  reset role;
  a_id := (select id from public.tenants where slug = 'toko-a');
  set local role authenticated;
  begin
    insert into public.products (tenant_id, name) values (a_id, 'Sisipan jahat');
    raise exception 'B inserted into A';
  exception when insufficient_privilege then null;   -- 42501: new row violates RLS
  end;
  update public.variants set price = 1 where true;     -- affects 0 rows (A invisible)
  delete from public.products where true;
end $$;

-- Append-only: even inside one's own shop, sales/movements can't be updated or deleted.
do $$ begin
  begin
    update public.stock_movements set qty = 1 where true;
    raise exception 'stock_movements is updatable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Anonymous visitors see nothing and can't create shops.
reset role;
set local role anon;
do $$ begin
  begin
    perform count(*) from public.tenants;
    raise exception 'anon can read tenants';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.products where name = 'Serum Vit C') = 1, 'A product untouched';
  assert (select price from public.variants limit 1) = 89000, 'A variant untouched';
end $$;

rollback;
\o
select 'rls_isolation: ok' as result;
