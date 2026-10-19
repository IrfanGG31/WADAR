import { summarizeSales } from "@/core/channels/api-summary";
import { isoDateInZone, startOfDayUtc } from "@/core/period";
import { withApiKey } from "@/lib/api-v1";

/** GET /api/v1/summary — today's sales and the products at or under their minimum stock. */
export function GET(request: Request) {
  return withApiKey(request, "summary:read", async ({ caller, db }) => {
    const today = isoDateInZone(new Date(), caller.timezone);
    const [sales, stock] = await Promise.all([
      db.from("sales").select("total, status").eq("tenant_id", caller.tenantId).gte("occurred_at", startOfDayUtc(today, caller.timezone)).limit(10_000),
      db.from("variants").select("id, on_hand, min_stock").eq("tenant_id", caller.tenantId).limit(5000),
    ]);
    if (sales.error) throw sales.error;
    if (stock.error) throw stock.error;
    const low = (stock.data ?? []).filter((v) => v.on_hand <= v.min_stock).length;
    return Response.json({ date: today, ...summarizeSales(sales.data ?? []), low_stock_products: low }, { headers: { "Cache-Control": "no-store" } });
  });
}
