import { describe, expect, it, vi } from "vitest";
import {
  dismissRejected,
  EMPTY_QUEUE,
  enqueueSale,
  flushQueue,
  isNetworkFailure,
  MAX_PENDING,
  mergeAfterFlush,
  parseQueue,
  pendingLabel,
  queueStorageKey,
  resolveOccurredAt,
  serializeQueue,
  type OfflineQueue,
  type OfflineSalePayload,
  type SendResult,
} from "./offline-sales";

const NOW = new Date("2026-10-17T10:00:00.000Z");

function payload(key: string): OfflineSalePayload {
  return {
    channel_id: "00000000-0000-4000-8000-0000000000c1",
    items: [{ variant_id: "00000000-0000-4000-8000-0000000000a1", qty: 2 }],
    order_discount: 0,
    payment_method: "tunai",
    customer_phone: "",
    customer_name: "",
    idempotency_key: key,
    occurred_at: NOW.toISOString(),
  };
}

function queueOf(...keys: string[]): OfflineQueue {
  return keys.reduce((q, k) => enqueueSale(q, payload(k), { total: 10_000, items: 2, now: NOW }).queue, EMPTY_QUEUE);
}

/** A fake server with record_sale's idempotency: a key it has seen returns the stored sale. */
function fakeServer() {
  const stored = new Map<string, string>();
  const send = vi.fn(async (p: OfflineSalePayload): Promise<SendResult> => {
    const existing = stored.get(p.idempotency_key);
    if (existing) return { saleId: existing, duplicate: true };
    const id = `sale-${stored.size + 1}`;
    stored.set(p.idempotency_key, id);
    return { saleId: id, duplicate: false };
  });
  return { stored, send };
}

describe("antrean penjualan offline (POS-6)", () => {
  it("queues a sale once per idempotency key (double tap while offline)", () => {
    const first = enqueueSale(EMPTY_QUEUE, payload("key-0001"), { total: 25_000, items: 3, now: NOW });
    expect(first.added).toBe(true);
    expect(first.queue.pending).toHaveLength(1);
    expect(first.queue.pending[0]).toMatchObject({ key: "key-0001", total: 25_000, items: 3, attempts: 0, queued_at: NOW.toISOString() });

    const again = enqueueSale(first.queue, payload("key-0001"), { total: 25_000, items: 3, now: NOW });
    expect(again.added).toBe(false);
    expect(again.queue).toBe(first.queue);
  });

  it("refuses to grow past MAX_PENDING instead of silently dropping sales", () => {
    const full = queueOf(...Array.from({ length: MAX_PENDING }, (_, i) => `key-${String(i).padStart(4, "0")}`));
    const over = enqueueSale(full, payload("key-over"), { total: 1, items: 1, now: NOW });
    expect(over).toEqual({ queue: full, added: false, full: true });
  });

  it("survives a round trip through storage and drops unreadable entries", () => {
    const q = queueOf("key-0001", "key-0002");
    expect(parseQueue(serializeQueue(q))).toEqual(q);
    expect(parseQueue(null)).toEqual(EMPTY_QUEUE);
    expect(parseQueue("{not json")).toEqual(EMPTY_QUEUE);
    const tampered = JSON.stringify({ pending: [{ key: "key-0003", queued_at: "x", payload: { idempotency_key: "other", items: [] } }], rejected: "x" });
    expect(parseQueue(tampered)).toEqual(EMPTY_QUEUE);
    expect(queueStorageKey("kopi-dimas")).toBe("offline-sales:v1:kopi-dimas");
  });

  it("network failures are told apart from refusals", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkFailure(new Error("Load failed"), true)).toBe(true);
    expect(isNetworkFailure(new Error("anything"), false)).toBe(true);
    expect(isNetworkFailure(new Error("Server Components render error"), true)).toBe(false);
  });

  it("flush sends oldest first and empties the queue", async () => {
    const server = fakeServer();
    const result = await flushQueue(queueOf("key-0001", "key-0002"), server.send);
    expect(server.send.mock.calls.map(([p]) => p.idempotency_key)).toEqual(["key-0001", "key-0002"]);
    expect(result).toMatchObject({ synced: 2, rejected: 0, interrupted: false, queue: EMPTY_QUEUE });
  });

  it("idempotent: flushing the same entries twice (two tabs) records each sale once", async () => {
    const server = fakeServer();
    const q = queueOf("key-0001", "key-0002");
    const [a, b] = await Promise.all([flushQueue(q, server.send), flushQueue(q, server.send)]);
    expect(server.stored.size).toBe(2);
    expect(a.queue.pending).toHaveLength(0);
    expect(b.queue.pending).toHaveLength(0);
    // A lost response then a resend: same key → the stored sale, not a second one.
    await flushQueue(queueOf("key-0001"), server.send);
    expect(server.stored.size).toBe(2);
  });

  it("stops at a network failure and keeps the rest queued, counting the attempt", async () => {
    const server = fakeServer();
    const send = vi.fn(async (p: OfflineSalePayload) => {
      if (p.idempotency_key === "key-0002") throw new TypeError("Failed to fetch");
      return server.send(p);
    });
    const result = await flushQueue(queueOf("key-0001", "key-0002", "key-0003"), send);
    expect(result.synced).toBe(1);
    expect(result.interrupted).toBe(true);
    expect(result.queue.pending.map((q) => [q.key, q.attempts])).toEqual([["key-0002", 1], ["key-0003", 0]]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("a temporary server error keeps the sale; a refusal moves it to rejected with the reason", async () => {
    const temporary = await flushQueue(queueOf("key-0001"), async () => ({ error: "Transaksi belum tersimpan.", retryable: true }));
    expect(temporary.queue.pending).toHaveLength(1);
    expect(temporary.queue.rejected).toHaveLength(0);

    const refused = await flushQueue(queueOf("key-0001", "key-0002"), async (p) =>
      p.idempotency_key === "key-0001" ? { error: "Stok Serum tinggal 1" } : { saleId: "s2" },
    );
    expect(refused).toMatchObject({ synced: 1, rejected: 1, interrupted: false });
    expect(refused.queue.rejected).toEqual([expect.objectContaining({ key: "key-0001", reason: "Stok Serum tinggal 1" })]);
    // A rejected key is not queued again by accident, and the cashier can dismiss it.
    expect(enqueueSale(refused.queue, payload("key-0001"), { total: 1, items: 1, now: NOW }).added).toBe(false);
    expect(dismissRejected(refused.queue, "key-0001").rejected).toHaveLength(0);
  });

  it("merge after a flush keeps sales another tab queued and drops the ones settled", async () => {
    const start = queueOf("key-0001", "key-0002");
    const result = await flushQueue(start, async (p) => (p.idempotency_key === "key-0001" ? { saleId: "s1" } : { error: "Stok habis" }));
    const latest = queueOf("key-0001", "key-0002", "key-0003"); // another tab added key-0003
    const merged = mergeAfterFlush(start, result.queue, latest);
    expect(merged.pending.map((q) => q.key)).toEqual(["key-0003"]);
    expect(merged.rejected.map((r) => r.key)).toEqual(["key-0002"]);

    // Still offline: the waiting entry keeps its attempt count and stays first.
    const offline = await flushQueue(start, async () => {
      throw new TypeError("Failed to fetch");
    });
    const kept = mergeAfterFlush(start, offline.queue, latest);
    expect(kept.pending.map((q) => [q.key, q.attempts])).toEqual([["key-0001", 1], ["key-0002", 0], ["key-0003", 0]]);
  });

  it("labels what is waiting", () => {
    expect(pendingLabel(EMPTY_QUEUE)).toBeNull();
    expect(pendingLabel(queueOf("key-0001", "key-0002"))).toBe("2 transaksi menunggu sinkron");
  });
});

describe("waktu transaksi offline di server", () => {
  it("keeps the device time for a sale up to 24 hours old", () => {
    const at = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
    expect(resolveOccurredAt(at, NOW)).toEqual({ occurredAt: at, note: null });
  });

  it("books older sales now and keeps the device time in the note (rollup days stay right)", () => {
    const at = "2026-10-15T08:00:00.000Z";
    expect(resolveOccurredAt(at, NOW)).toEqual({ occurredAt: null, note: "Dicatat offline 2026-10-15T08:00:00.000Z, terkirim terlambat." });
  });

  it("future, missing or invalid times fall back to the database clock", () => {
    expect(resolveOccurredAt("2026-10-17T11:00:00.000Z", NOW)).toEqual({ occurredAt: null, note: null });
    expect(resolveOccurredAt(undefined, NOW)).toEqual({ occurredAt: null, note: null });
    expect(resolveOccurredAt("kemarin", NOW)).toEqual({ occurredAt: null, note: null });
  });
});
