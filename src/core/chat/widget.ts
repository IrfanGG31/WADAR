import { z } from "zod";

/**
 * Public widget (CHT-8): anonymous session ids, the message payload, and the
 * rate limit (10 messages per minute per session — TECH-SPEC §7.3 "Widget").
 * The session comes from a cookie the client can drop, so the same window also
 * caps each client IP and the whole shop (`rate-limit.ts`).
 */
export const RATE_LIMIT_MESSAGES = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const WIDGET_SESSION_LIMIT = RATE_LIMIT_MESSAGES;
/** Room for a few visitors behind one NAT / carrier IP. */
export const WIDGET_IP_LIMIT = 30;
/** All widget messages of one shop per minute: bounds the LLM spend a spray of IPs can cause. */
export const WIDGET_TENANT_LIMIT = 120;

/** Random URL-safe id minted by the server; anything else in the cookie is ignored. */
export function isValidSessionId(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22,64}$/.test(value);
}

export const WidgetMessageInput = z.object({
  text: z.string().trim().min(1, "Pesan masih kosong.").max(500, "Pesan maksimal 500 huruf."),
  /** Client-generated id for this message: a double-tap or retry stores it once. */
  client_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

export type WidgetMessageInput = z.infer<typeof WidgetMessageInput>;

export interface RateLimitResult {
  limited: boolean;
  /** Seconds until the oldest message in the window falls out (0 when not limited). */
  retryAfterSeconds: number;
}

/**
 * Sliding window over the session's recent inbound message times (ms):
 * limited when `limit` messages already fall inside the last `windowMs`.
 */
export function checkRateLimit(
  recentMs: readonly number[],
  nowMs: number,
  limit = RATE_LIMIT_MESSAGES,
  windowMs = RATE_LIMIT_WINDOW_MS,
): RateLimitResult {
  const inWindow = recentMs.filter((t) => t > nowMs - windowMs && t <= nowMs).sort((a, b) => a - b);
  if (inWindow.length < limit) return { limited: false, retryAfterSeconds: 0 };
  const oldestThatMatters = inWindow[inWindow.length - limit];
  return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((oldestThatMatters + windowMs - nowMs) / 1000)) };
}

/** A new chat session (BRL-03 "percakapan") starts when the last inbound message is older than 24 hours. */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function startsNewWindow(lastInboundAt: string | null, nowMs: number): boolean {
  if (!lastInboundAt) return true;
  return nowMs - Date.parse(lastInboundAt) >= SESSION_WINDOW_MS;
}

/** "Pengunjung A1B2" — the inbox name of an anonymous widget visitor. */
export function visitorLabel(externalUserId: string): string {
  return `Pengunjung ${externalUserId.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}`;
}
