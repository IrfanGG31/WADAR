import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Service role only (migration 20261017110000 grants EXECUTE to service_role alone). Returns the number of shops deleted. */
export async function purgeDueShops(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc("purge_due_shops");
  if (error) throw error;
  return Number(data ?? 0);
}

/** Deletes `ai_answer_cache` rows already expired at `now` (migration 20261017100000). Returns the number deleted. */
export async function pruneExpiredAnswerCache(db: SupabaseClient, now: Date): Promise<number> {
  const { error, count } = await db.from("ai_answer_cache").delete({ count: "exact" }).lte("expires_at", now.toISOString());
  if (error) throw error;
  return count ?? 0;
}
