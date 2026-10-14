import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface SaleListItem {
  id: string;
  occurred_at: string;
  subtotal: number;
  order_discount: number;
  platform_fee: number;
  total: number;
  payment_method: string | null;
  channel: { name: string; kind: string } | null;
  customer: { name: string | null; phone_e164: string | null } | null;
  items: { name_snapshot: string; qty: number; unit_price: number; line_discount: number }[];
}

/** Latest sales of a shop, newest first (Riwayat). */
export async function listRecentSales(tenantId: string, limit = 30): Promise<SaleListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, occurred_at, subtotal, order_discount, platform_fee, total, payment_method, " +
        "channel:channels(name, kind), customer:customers(name, phone_e164), " +
        "items:sale_items(name_snapshot, qty, unit_price, line_discount)",
    )
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SaleListItem[];
}
