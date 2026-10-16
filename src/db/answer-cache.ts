import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerStore } from "@/core/answer-cache";

/**
 * `ai_answer_cache` (migration 20261017100000) as an `AnswerStore` for one
 * tenant. Works with the service role (widget) or the owner's client (RLS).
 * Errors are thrown; callers wrap the store with `safeGet`/`safeSet`, so a
 * missing table (migration not applied yet) is just a cache miss.
 */
export function tableAnswerStore(db: SupabaseClient, tenantId: string, now: () => number = Date.now): AnswerStore {
  return {
    async get<V>(key: string) {
      const { data, error } = await db
        .from("ai_answer_cache")
        .select("value")
        .eq("tenant_id", tenantId)
        .eq("cache_key", key)
        .gt("expires_at", new Date(now()).toISOString())
        .maybeSingle();
      if (error) throw error;
      return data ? (data.value as V) : null;
    },
    async set(key, value, ttlMs) {
      const { error } = await db.from("ai_answer_cache").upsert(
        { tenant_id: tenantId, cache_key: key, value, expires_at: new Date(now() + ttlMs).toISOString(), created_at: new Date(now()).toISOString() },
        { onConflict: "tenant_id,cache_key" },
      );
      if (error) throw error;
    },
  };
}
