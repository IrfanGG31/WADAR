import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string | null;
  option_label: string | null;
  price: number;
  avg_cost: number;
  cost_is_set: boolean;
  on_hand: number;
  min_stock: number;
  lead_time_days: number;
  pack_size: number;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  image_path: string | null;
  is_active: boolean;
  variants: VariantRow[];
}

const PRODUCT_COLUMNS =
  "id, name, category, description, unit, image_path, is_active, " +
  "variants(id, product_id, sku, option_label, price, avg_cost, cost_is_set, on_hand, min_stock, lead_time_days, pack_size)";

/** Active catalog of a shop (RLS: members only), products by name, variants by label. */
export async function listCatalog(tenantId: string): Promise<ProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  const rows = (data ?? []) as unknown as ProductRow[];
  for (const p of rows) p.variants.sort((a, b) => (a.option_label ?? "").localeCompare(b.option_label ?? ""));
  return rows;
}

export async function getProduct(tenantId: string, productId: string): Promise<ProductRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProductRow | null) ?? null;
}

/** "Serum Vit C — Pink" */
export function variantLabel(product: Pick<ProductRow, "name">, variant: Pick<VariantRow, "option_label">): string {
  return variant.option_label ? `${product.name} — ${variant.option_label}` : product.name;
}
