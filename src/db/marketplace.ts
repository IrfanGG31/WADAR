import "server-only";
import type { VariantRef } from "@/core/marketplace-import";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";

export interface MarketplaceImportRow {
  id: string;
  marketplace: string;
  file_name: string | null;
  orders_created: number;
  orders_duplicate: number;
  orders_canceled: number;
  orders_failed: number;
  created_at: string;
  channel: { name: string } | null;
}

/** IMP: the shop's latest marketplace imports, newest first. */
export async function listMarketplaceImports(tenantId: string, limit = 20): Promise<MarketplaceImportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_imports")
    .select("id, marketplace, file_name, orders_created, orders_duplicate, orders_canceled, orders_failed, created_at, channel:channels(name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as MarketplaceImportRow[];
}

/** Every sellable variant with its SKU and "Product — Option" label, for matching order lines. */
export async function listVariantRefs(tenantId: string): Promise<VariantRef[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<{ id: string; sku: string | null; option_label: string | null; products: { name: string; deleted_at: string | null } | null }>(
    (from, to) =>
      supabase
        .from("variants")
        .select("id, sku, option_label, products!inner(name, deleted_at)")
        .eq("tenant_id", tenantId)
        .is("products.deleted_at", null)
        .order("id")
        .range(from, to),
  );
  return rows
    .map((v) => {
      const name = v.products?.name ?? "Produk";
      return { id: v.id, sku: v.sku, label: v.option_label ? `${name} — ${v.option_label}` : name };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "id"));
}
