import "server-only";
import { storedRowErrors, type RowError } from "@/core/catalog-import";
import { createClient } from "@/lib/supabase/server";

export interface CatalogImportRow {
  id: string;
  file_name: string | null;
  rows_total: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  created_at: string;
  /** Failed rows (CSV line + reason), oldest line first. */
  errors: RowError[];
}

/**
 * Latest catalog imports of a shop (GAP #3 riwayat; RLS: members only), newest first.
 * The history is a side panel: a database without `catalog_imports` yet (migration
 * 20261017120000 not applied) or any read error shows as "no history".
 */
export async function listCatalogImports(tenantId: string, limit = 10): Promise<CatalogImportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_imports")
    .select("id, file_name, rows_total, created_count, updated_count, failed_count, created_at, errors")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("catalog import history unavailable", error.code);
    return [];
  }
  return ((data ?? []) as (Omit<CatalogImportRow, "errors"> & { errors: unknown })[]).map((r) => ({
    ...r,
    errors: storedRowErrors(r.errors),
  }));
}
