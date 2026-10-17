import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDateInZone } from "@/core/period";

/**
 * The shop's local date, or null when the shop row can't be read — then every
 * day counts as open and the loaders read the live views only. Callers run
 * inside a request (pages already awaited `connection()`), so reading the clock
 * here is safe.
 */
export async function shopTodayById(db: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  if (error || !data?.timezone) return null;
  return isoDateInZone(new Date(), data.timezone as string);
}

/**
 * Rollup rows, or [] when the table can't be read (migration not applied yet,
 * RLS, network): the live view then answers every day, so the screen still
 * shows the same numbers.
 */
export async function rollupRowsOrEmpty<T>(table: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (e) {
    console.warn(`${table} unreadable, reading live`, e);
    return [];
  }
}
