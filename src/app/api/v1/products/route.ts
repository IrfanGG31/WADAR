import { withApiKey } from "@/lib/api-v1";

/**
 * GET /api/v1/products — the shop's sellable variants with price and stock (no cost/HPP).
 * For a bot that answers "ada stok?" itself, or to keep another sales channel in sync.
 */
export function GET(request: Request) {
  return withApiKey(request, "catalog:read", async ({ caller, db }) => {
    const { data, error } = await db
      .from("variants")
      .select("id, sku, option_label, price, on_hand, products!inner(name, category, unit, is_active, deleted_at)")
      .eq("tenant_id", caller.tenantId)
      .eq("products.is_active", true)
      .is("products.deleted_at", null)
      .order("id")
      .limit(2000);
    if (error) throw error;
    const products = (data ?? []).map((v) => {
      const p = v.products as unknown as { name: string; category: string | null; unit: string };
      return {
        variant_id: v.id,
        sku: v.sku,
        name: v.option_label ? `${p.name} — ${v.option_label}` : p.name,
        category: p.category,
        unit: p.unit,
        price: Number(v.price),
        on_hand: v.on_hand,
      };
    });
    return Response.json({ products }, { headers: { "Cache-Control": "no-store" } });
  });
}
