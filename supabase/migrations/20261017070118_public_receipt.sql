alter table public.sales
  add column receipt_token text not null
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
alter table public.sales add constraint sales_receipt_token_format check (receipt_token ~ '^[0-9a-f]{64}$');
create unique index sales_receipt_token_key on public.sales (receipt_token);

create or replace function public.get_public_receipt(p_token text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sale_id', s.id,
    'shop_name', t.name,
    'timezone', t.timezone,
    'occurred_at', s.occurred_at,
    'status', s.status,
    'payment_method', s.payment_method,
    'channel_name', c.name,
    'subtotal', s.subtotal,
    'order_discount', s.order_discount,
    'total', s.total,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'qty', i.qty,
                                                           'unit_price', i.unit_price, 'line_discount', i.line_discount)
                                        order by i.id)
                         from public.sale_items i
                        where i.sale_id = s.id and i.tenant_id = s.tenant_id), '[]'::jsonb))
    from public.sales s
    join public.tenants t on t.id = s.tenant_id
    left join public.channels c on c.id = s.channel_id
   where p_token ~ '^[0-9a-f]{64}$'
     and s.receipt_token = p_token
     and t.deletion_requested_at is null;
$$;

revoke all on function public.get_public_receipt(text) from public;
grant execute on function public.get_public_receipt(text) to anon, authenticated, service_role;
