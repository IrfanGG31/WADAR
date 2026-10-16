import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMemoryRateLimiter, type RateLimiter } from "@/core/rate-limit";

const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);
const fallbacks = new Map<number, RateLimiter>();

function fallback(windowMs: number): RateLimiter {
  let l = fallbacks.get(windowMs);
  if (!l) fallbacks.set(windowMs, (l = createMemoryRateLimiter(windowMs)));
  return l;
}

/**
 * The limiter shared by all serverless instances (`public.widget_rate_hit`,
 * service role). Without a service-role client, or before that migration is
 * applied, it degrades to the per-instance limiter — never to no limit.
 */
export function sharedRateLimiter(db: SupabaseClient | null, windowMs: number): RateLimiter {
  if (!db) return fallback(windowMs);
  return {
    async hit(buckets, nowMs) {
      const { data, error } = await db.rpc("widget_rate_hit", {
        p_buckets: buckets.map((b) => b.key),
        p_limits: buckets.map((b) => b.limit),
        p_window_ms: windowMs,
      });
      if (error) {
        if (error.code && MISSING_FUNCTION.has(error.code)) {
          console.warn("widget_rate_hit missing — using the per-instance limiter");
          return fallback(windowMs).hit(buckets, nowMs);
        }
        throw error;
      }
      const retryAfterSeconds = Number(data ?? 0);
      return { limited: retryAfterSeconds > 0, retryAfterSeconds };
    },
  };
}
