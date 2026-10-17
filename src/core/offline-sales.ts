/**
 * POS offline (POS-6), the small honest version: when Bayar cannot reach the
 * server (network, not a refusal), the sale is kept on this device and sent
 * again later. Only sales are queued — never products or settings.
 *
 * Exactly-once comes from the server, not from here: every queued sale keeps
 * the `idempotency_key` generated for its cart, and `public.record_sale`
 * returns the stored sale for a key it has seen (`duplicate: true`). Sending
 * the same entry twice (two tabs, an `online` event racing the page load) is
 * therefore harmless. Pure functions over a plain state object; the browser
 * glue (localStorage, `online` event) lives in the Kasir client component.
 */

/** What `recordSale` accepts, as stored on the device. */
export interface OfflineSalePayload {
  channel_id: string;
  items: { variant_id: string; qty: number }[];
  order_discount: number;
  payment_method: string;
  customer_phone: string;
  customer_name: string;
  idempotency_key: string;
  /** Device clock when Bayar was pressed (ISO); the server decides whether to keep it. */
  occurred_at: string;
}

export interface QueuedSale {
  key: string;
  queued_at: string;
  /** For the "menunggu sinkron" list only; the server recomputes every number. */
  total: number;
  items: number;
  attempts: number;
  payload: OfflineSalePayload;
}

export interface RejectedSale extends QueuedSale {
  reason: string;
}

export interface OfflineQueue {
  pending: QueuedSale[];
  /** Refused by the server (e.g. stock ran out meanwhile): shown until the cashier dismisses it. */
  rejected: RejectedSale[];
}

/** A device holding more unsent sales than this is told to get online instead of queueing more. */
export const MAX_PENDING = 200;

export const EMPTY_QUEUE: OfflineQueue = { pending: [], rejected: [] };

export function queueStorageKey(slug: string): string {
  return `offline-sales:v1:${slug}`;
}

function isQueued(x: unknown): x is QueuedSale {
  if (!x || typeof x !== "object") return false;
  const q = x as Partial<QueuedSale>;
  return (
    typeof q.key === "string" &&
    q.key.length >= 8 &&
    typeof q.queued_at === "string" &&
    !!q.payload &&
    typeof q.payload === "object" &&
    q.payload.idempotency_key === q.key &&
    Array.isArray(q.payload.items)
  );
}

/** Stored JSON → queue; anything unreadable is dropped rather than crashing the till. */
export function parseQueue(raw: string | null | undefined): OfflineQueue {
  if (!raw) return EMPTY_QUEUE;
  try {
    const data = JSON.parse(raw) as Partial<OfflineQueue>;
    const pending = Array.isArray(data.pending) ? data.pending.filter(isQueued) : [];
    const rejected = Array.isArray(data.rejected)
      ? data.rejected.filter((r): r is RejectedSale => isQueued(r) && typeof (r as RejectedSale).reason === "string")
      : [];
    return { pending, rejected };
  } catch {
    return EMPTY_QUEUE;
  }
}

export function serializeQueue(queue: OfflineQueue): string {
  return JSON.stringify(queue);
}

export type EnqueueResult = { queue: OfflineQueue; added: boolean; full?: boolean };

/** Add a sale; the same idempotency key is never queued twice (double tap while offline). */
export function enqueueSale(
  queue: OfflineQueue,
  payload: OfflineSalePayload,
  meta: { total: number; items: number; now: Date },
): EnqueueResult {
  const key = payload.idempotency_key;
  if (queue.pending.some((q) => q.key === key) || queue.rejected.some((q) => q.key === key)) {
    return { queue, added: false };
  }
  if (queue.pending.length >= MAX_PENDING) return { queue, added: false, full: true };
  const entry: QueuedSale = {
    key,
    queued_at: meta.now.toISOString(),
    total: meta.total,
    items: meta.items,
    attempts: 0,
    payload,
  };
  return { queue: { ...queue, pending: [...queue.pending, entry] }, added: true };
}

export function dismissRejected(queue: OfflineQueue, key: string): OfflineQueue {
  return { ...queue, rejected: queue.rejected.filter((r) => r.key !== key) };
}

/**
 * Did the call fail because the server could not be reached? Browsers reject a
 * failed fetch with a TypeError ("Failed to fetch", "Load failed", "NetworkError…");
 * an offline device is a network failure whatever the error says.
 */
export function isNetworkFailure(error: unknown, online: boolean): boolean {
  if (!online) return true;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(message);
}

/** Server answer for one sale, as returned by the `recordSale` action. */
export interface SendResult {
  error?: string;
  /** The error is temporary (database hiccup): keep the sale queued. */
  retryable?: boolean;
  saleId?: string;
  duplicate?: boolean;
}

export interface FlushResult {
  queue: OfflineQueue;
  synced: number;
  rejected: number;
  /** Stopped early because the server was unreachable again; the rest stays queued. */
  interrupted: boolean;
}

/**
 * Send queued sales oldest first. Synced (new or `duplicate`) → removed;
 * refused → moved to `rejected` with the server's reason; unreachable or a
 * temporary error → kept, and the run stops (later sales would fail the same way).
 */
export async function flushQueue(
  queue: OfflineQueue,
  send: (payload: OfflineSalePayload) => Promise<SendResult>,
): Promise<FlushResult> {
  const pending = [...queue.pending];
  const rejected = [...queue.rejected];
  let synced = 0;
  let refused = 0;
  while (pending.length > 0) {
    const entry = pending[0];
    let result: SendResult;
    try {
      result = await send(entry.payload);
    } catch {
      // Unreachable or crashed mid-way: the key makes a later resend safe either way.
      pending[0] = { ...entry, attempts: entry.attempts + 1 };
      return { queue: { pending, rejected }, synced, rejected: refused, interrupted: true };
    }
    if (result.error && result.retryable) {
      pending[0] = { ...entry, attempts: entry.attempts + 1 };
      return { queue: { pending, rejected }, synced, rejected: refused, interrupted: true };
    }
    pending.shift();
    if (result.error) {
      rejected.push({ ...entry, attempts: entry.attempts + 1, reason: result.error });
      refused++;
    } else {
      synced++;
    }
  }
  return { queue: { pending, rejected }, synced, rejected: refused, interrupted: false };
}

/**
 * Combine a finished flush with what is in storage now (another tab may have
 * queued or dismissed meanwhile): sales this flush settled are dropped, sales
 * queued since are kept after the ones still waiting, new refusals are added.
 */
export function mergeAfterFlush(start: OfflineQueue, flushed: OfflineQueue, latest: OfflineQueue): OfflineQueue {
  const stillPending = new Set(flushed.pending.map((q) => q.key));
  const settled = new Set(start.pending.map((q) => q.key).filter((k) => !stillPending.has(k)));
  const knownRejected = new Set(start.rejected.map((r) => r.key));
  const latestRejected = new Set(latest.rejected.map((r) => r.key));
  return {
    pending: [...flushed.pending, ...latest.pending.filter((q) => !settled.has(q.key) && !stillPending.has(q.key))],
    rejected: [
      ...latest.rejected,
      ...flushed.rejected.filter((r) => !knownRejected.has(r.key) && !latestRejected.has(r.key)),
    ],
  };
}

/* ─── Server side: when did an offline sale happen? ─────────────────────────── */

/**
 * Oldest device time the server books as the sale's own time. The nightly rollup
 * rebuilds the last 2 closed days, so a sale up to 24 hours old still lands in
 * frozen report days; older ones are booked now, with the device time in the note.
 */
export const OFFLINE_BACKDATE_MAX_MS = 24 * 60 * 60 * 1000;
export interface OccurredAt {
  /** Passed as `p_occurred_at`; null = the database's now(). */
  occurredAt: string | null;
  note: string | null;
}

export function resolveOccurredAt(clientIso: string | null | undefined, now: Date): OccurredAt {
  if (!clientIso) return { occurredAt: null, note: null };
  const at = Date.parse(clientIso);
  if (Number.isNaN(at)) return { occurredAt: null, note: null };
  const age = now.getTime() - at;
  // A device clock ahead of the server: book it now rather than in the future.
  if (age <= 0) return { occurredAt: null, note: null };
  if (age > OFFLINE_BACKDATE_MAX_MS) {
    return { occurredAt: null, note: `Dicatat offline ${new Date(at).toISOString()}, terkirim terlambat.` };
  }
  return { occurredAt: new Date(at).toISOString(), note: null };
}

/** "2 transaksi menunggu sinkron"; null when nothing waits. */
export function pendingLabel(queue: OfflineQueue): string | null {
  const n = queue.pending.length;
  return n === 0 ? null : `${n} transaksi menunggu sinkron`;
}
