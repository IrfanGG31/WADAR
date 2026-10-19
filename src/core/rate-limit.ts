import {
  checkRateLimit,
  RATE_LIMIT_WINDOW_MS,
  WIDGET_IP_LIMIT,
  WIDGET_SESSION_LIMIT,
  WIDGET_TENANT_LIMIT,
  type RateLimitResult,
} from "./chat/widget";

/**
 * Widget rate limit over several buckets at once (session, client IP, whole
 * shop). The cookie session alone is not enough: a client that drops its
 * cookie gets a new session per request, so the IP and shop buckets are what
 * actually bound the cost. A hit is all-or-nothing: if any bucket is full the
 * request is rejected and nothing is recorded.
 */
export interface RateBucket {
  key: string;
  limit: number;
}

export interface RateLimiter {
  hit(buckets: readonly RateBucket[], nowMs: number): Promise<RateLimitResult>;
}

/** "Coba demo" builds a 90-day shop (~1 s of database work): per client IP per hour. Room for a venue Wi-Fi. */
export const DEMO_IP_LIMIT = 20;
export const DEMO_WINDOW_MS = 60 * 60 * 1000;

export function widgetBuckets(args: { tenantId: string; sessionId: string; ip: string | null }): RateBucket[] {
  return [
    { key: `session:${args.tenantId}:${args.sessionId}`, limit: WIDGET_SESSION_LIMIT },
    { key: `ip:${args.tenantId}:${args.ip ?? "unknown"}`, limit: WIDGET_IP_LIMIT },
    { key: `tenant:${args.tenantId}`, limit: WIDGET_TENANT_LIMIT },
  ];
}

/**
 * Buyer messages relayed by a server (Telegram/WhatsApp webhook, a bot through the WADAR API) all
 * come from the provider's IP, so a per-IP bucket would throttle every buyer of the shop at once.
 * The buyer's id on that channel (set by the provider, not by the buyer) and the shop bound them.
 */
export function relayedBuckets(args: { tenantId: string; channel: string; externalUserId: string }): RateBucket[] {
  return [
    { key: `session:${args.tenantId}:${args.channel}:${args.externalUserId}`, limit: WIDGET_SESSION_LIMIT },
    { key: `tenant:${args.tenantId}`, limit: WIDGET_TENANT_LIMIT },
  ];
}

/** Client IP as set by the platform proxy: first hop of x-forwarded-for, else x-real-ip. */
export function clientIp(headers: Headers): string | null {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * In-process sliding window. Check-and-record runs synchronously, so parallel
 * requests in one instance cannot both take the last slot. Per instance only:
 * the database limiter (`app.widget_rate_hit`) is the shared one; this is its
 * fallback and the test double.
 */
export function createMemoryRateLimiter(windowMs = RATE_LIMIT_WINDOW_MS, maxKeys = 10_000): RateLimiter {
  const hits = new Map<string, number[]>();
  const recent = (key: string, nowMs: number) => (hits.get(key) ?? []).filter((t) => t > nowMs - windowMs);
  return {
    async hit(buckets, nowMs) {
      let retryAfterSeconds = 0;
      for (const b of buckets) {
        const r = checkRateLimit(recent(b.key, nowMs), nowMs, b.limit, windowMs);
        if (r.limited) retryAfterSeconds = Math.max(retryAfterSeconds, r.retryAfterSeconds);
      }
      if (retryAfterSeconds > 0) return { limited: true, retryAfterSeconds };
      for (const b of buckets) {
        const kept = [...recent(b.key, nowMs), nowMs];
        hits.delete(b.key); // re-insert so the key moves to the "recently used" end
        hits.set(b.key, kept);
      }
      // Oldest-touched keys first (Map keeps insertion order): drop them past the cap.
      for (const key of hits.keys()) {
        if (hits.size <= maxKeys) break;
        hits.delete(key);
      }
      return { limited: false, retryAfterSeconds: 0 };
    },
  };
}
