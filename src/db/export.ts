import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportData } from "@/core/export";
import { fetchAllRows } from "./paginate";

/**
 * Every table of one shop for the data export (GAP #6), read as the signed-in
 * owner: RLS already limits rows to their shops, the tenant filter picks this one.
 * Paged (PostgREST caps responses), ordered by a unique key so pages never overlap.
 */
const TABLES: { [K in keyof ExportData]: { columns: string; order: string } } = {
  channels: { columns: "id, name", order: "id" },
  products: { columns: "id, name, category, unit, is_active, deleted_at, created_at", order: "id" },
  variants: { columns: "id, product_id, sku, barcode, option_label, price, avg_cost, on_hand, min_stock, created_at", order: "id" },
  sales: {
    columns:
      "id, occurred_at, channel_id, status, customer_id, subtotal, order_discount, shipping_subsidy, platform_fee, total, payment_method, note",
    order: "id",
  },
  sale_items: { columns: "id, sale_id, variant_id, name_snapshot, qty, unit_price, line_discount, unit_cost_snapshot", order: "id" },
  expenses: { columns: "id, occurred_at, category, amount, note", order: "id" },
  customers: {
    columns: "id, name, phone_e164, first_channel, notes, tags, total_spent, orders_count, last_order_at",
    order: "id",
  },
  conversations: { columns: "id, channel, external_user_id, mode, status, escalation_reason, created_at, last_message_at", order: "id" },
  messages: { columns: "id, conversation_id, created_at, direction, author, content", order: "id" },
};

export async function loadExportData(db: SupabaseClient, tenantId: string): Promise<ExportData> {
  const keys = Object.keys(TABLES) as (keyof ExportData)[];
  const loaded = await Promise.all(
    keys.map((table) =>
      fetchAllRows((from, to) =>
        db.from(table).select(TABLES[table].columns).eq("tenant_id", tenantId).order(TABLES[table].order).range(from, to),
      ),
    ),
  );
  return Object.fromEntries(keys.map((k, i) => [k, loaded[i]])) as unknown as ExportData;
}
