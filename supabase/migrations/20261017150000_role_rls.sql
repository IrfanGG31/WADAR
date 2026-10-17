-- CON-6 sisa: RLS / RPC respect the member's role, not only membership.
-- Mirrors the matrix in src/core/roles.ts:
--   owner      = everything
--   cashier    = record sales + stock in (sales, sale_items, stock_movements purchase/sale, customers)
--   chat_admin = chat (take over, reply, return to AI) + escalation notifications
-- Reads stay `app.is_member` (cashiers need the catalog, chat admins the inbox).
-- Writes that used `tenant_rw` (for all, is_member) get one SELECT policy plus
-- INSERT/UPDATE/DELETE policies gated by `app.has_shop_role`.
-- Security-definer paths (record_sale, stock_in, reset_demo_shop) bypass RLS, so the
-- sale / stock-movement triggers and an explicit check in reset_demo_shop cover them.
-- The server (service role, no JWT user) is never blocked.

create or replace function app.has_shop_role(p_tenant uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  )
$$;
revoke execute on function app.has_shop_role(uuid, public.member_role[]) from public;
grant execute on function app.has_shop_role(uuid, public.member_role[]) to authenticated, service_role;

create or replace function app.assert_role(p_tenant uuid, p_roles public.member_role[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not app.has_shop_role(p_tenant, p_roles) then
    raise exception 'your role in this shop may not do this' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_role(uuid, public.member_role[]) from public;
grant execute on function app.assert_role(uuid, public.member_role[]) to authenticated, service_role;

-- ── Policies ────────────────────────────────────────────────────────────────
-- Replace a table's write policies: keep SELECT for members, gate the given commands by role.
create or replace function app.tmp_role_policies(p_table text, p_drop text[], p_cmds text[], p_roles text) returns void
language plpgsql as $$
declare
  p text;
  c text;
begin
  foreach p in array p_drop loop
    execute format('drop policy if exists %I on public.%I', p, p_table);
  end loop;
  execute format('drop policy if exists member_select on public.%I', p_table);
  execute format('create policy member_select on public.%I for select to authenticated using (app.is_member(tenant_id))', p_table);
  foreach c in array p_cmds loop
    execute format('drop policy if exists %I on public.%I', 'role_' || c, p_table);
    if c = 'insert' then
      execute format('create policy role_insert on public.%I for insert to authenticated
                        with check (app.has_shop_role(tenant_id, %L::public.member_role[]))', p_table, p_roles);
    elsif c = 'update' then
      execute format('create policy role_update on public.%I for update to authenticated
                        using (app.has_shop_role(tenant_id, %L::public.member_role[]))
                        with check (app.has_shop_role(tenant_id, %L::public.member_role[]))', p_table, p_roles, p_roles);
    else
      execute format('create policy role_delete on public.%I for delete to authenticated
                        using (app.has_shop_role(tenant_id, %L::public.member_role[]))', p_table, p_roles);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  -- Owner only: catalog, channels/fees, store profile + FAQ/KB, expenses, Konsultasi, settings.
  foreach t in array array['channels', 'products', 'variants', 'channel_prices', 'store_profile',
                           'kb_documents', 'kb_chunks', 'memory_items', 'insights', 'ai_answer_cache',
                           'notification_prefs'] loop
    perform app.tmp_role_policies(t, array['tenant_rw'], array['insert', 'update', 'delete'], '{owner}');
  end loop;
  perform app.tmp_role_policies('expenses', array['tenant_rw'], array['insert'], '{owner}');
  perform app.tmp_role_policies('catalog_imports', array['member_insert'], array['insert'], '{owner}');
  perform app.tmp_role_policies('weekly_insight_digests', array['member_insert'], array['insert'], '{owner}');

  -- Owner + cashier: the till (append-only tables) and the buyer list it fills.
  foreach t in array array['sales', 'sale_items', 'stock_movements'] loop
    perform app.tmp_role_policies(t, array['tenant_rw'], array['insert'], '{owner,cashier}');
  end loop;
  perform app.tmp_role_policies('customers', array['tenant_rw'], array['insert', 'update', 'delete'], '{owner,cashier}');

  -- Owner + chat admin: inbox, manual replies, escalation notifications.
  perform app.tmp_role_policies('conversations', array['tenant_rw'], array['update'], '{owner,chat_admin}');
  perform app.tmp_role_policies('notifications', array['member_mark_read'], array['update'], '{owner,chat_admin}');
end $$;
drop function app.tmp_role_policies(text, text[], text[], text);

-- Manual replies: the same shape as before, now owner / chat admin only.
drop policy if exists messages_member_reply on public.messages;
create policy messages_member_reply on public.messages for insert to authenticated
  with check (app.has_shop_role(tenant_id, '{owner,chat_admin}') and author = 'human' and direction = 'out');

-- Push devices: still one's own rows, and only for roles that get escalations.
drop policy if exists own_devices on public.push_subscriptions;
create policy own_devices on public.push_subscriptions for all to authenticated
  using (app.is_member(tenant_id) and user_id = (select auth.uid()))
  with check (app.has_shop_role(tenant_id, '{owner,chat_admin}') and user_id = (select auth.uid()));

-- Shop name / type / timezone: owner only (the deletion columns are function-only already).
drop policy if exists tenants_owner_update on public.tenants;
create policy tenants_owner_update on public.tenants for update to authenticated
  using (app.has_shop_role(id, '{owner}')) with check (app.has_shop_role(id, '{owner}'));

-- ── Security-definer paths ──────────────────────────────────────────────────
-- record_sale / stock_in run as definer (RLS off), so a trigger checks the signed-in
-- user's role. No JWT user (service role, seed scripts) = allowed.
-- Cashiers may book purchases (stok masuk) and sales; other movement kinds are owner only.
create or replace function app.check_till_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  -- Nested on purpose: a sales row has no `kind`, and plpgsql does not short-circuit AND.
  if tg_table_name = 'stock_movements' then
    if new.kind not in ('purchase', 'sale') then
      perform app.assert_role(new.tenant_id, '{owner}');
      return new;
    end if;
  end if;
  perform app.assert_role(new.tenant_id, '{owner,cashier}');
  return new;
end $$;
revoke execute on function app.check_till_role() from public;

create trigger sales_check_role before insert on public.sales
  for each row execute function app.check_till_role();
create trigger stock_movements_check_role before insert on public.stock_movements
  for each row execute function app.check_till_role();

-- Reset demo = a settings action (owner only); was any member.
create or replace function public.reset_demo_shop(p_tenant_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
begin
  perform app.assert_role(p_tenant_id, '{owner}');
  select * into t from public.tenants where id = p_tenant_id;
  if not t.is_demo then raise exception 'Hanya toko demo yang bisa di-reset' using errcode = '42501'; end if;
  perform app.archive_demo_shop(t.id);
  return (app.new_demo_shop(auth.uid(), app.demo_profile(t), t.slug)).slug;
end $$;
