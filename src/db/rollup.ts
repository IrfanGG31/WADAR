import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RollupCounts, RollupShop } from "@/core/rollup";
import type { PeriodWindow } from "@/core/period";
import { fetchAllRows } from "./paginate";

/** Every shop (service role, no session) with its timezone, ordered by id so pages don't overlap. */
export function listShopsForRollup(db: SupabaseClient): Promise<RollupShop[]> {
  return fetchAllRows<RollupShop>((from, to) => db.from("tenants").select("id, timezone").order("id").range(from, to));
}

/**
 * Rebuilds the shop's `fin_daily_rollup` / `stock_daily_rollup` rows for the window
 * (migration 20261017024644; EXECUTE granted to service_role only).
 */
export async function rollupShopDays(db: SupabaseClient, tenantId: string, window: PeriodWindow): Promise<RollupCounts> {
  const { data, error } = await db.rpc("rollup_daily", { p_tenant_id: tenantId, p_from: window.from, p_to: window.to });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Partial<RollupCounts> | null;
  return { fin_rows: Number(row?.fin_rows ?? 0), stock_rows: Number(row?.stock_rows ?? 0) };
}
