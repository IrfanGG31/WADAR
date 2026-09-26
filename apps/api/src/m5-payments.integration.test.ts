import type { IncomingPaymentView, OrderView, PaymentIntentView, WalletView } from "@wadar/contracts";
import { registerFinanceConsumers } from "@wadar/finance";
import { registerInventoryConsumers } from "@wadar/inventory";
import { registerNotificationConsumers } from "@wadar/notification";
import { PLATFORM_REALTIME, type RealtimeBroker } from "@wadar/platform";
import { registerSalesConsumers } from "@wadar/sales";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./testing/harness.js";

describe("M5 — payment listener, realtime, TTS text (real Postgres + Redis)", () => {
  let h: Harness;
  let variantId: string;
  let baseUrl: string;

  beforeAll(async () => {
    h = await createHarness((bus, app) => {
      registerInventoryConsumers(bus);
      registerSalesConsumers(bus);
      registerFinanceConsumers(bus);
      registerNotificationConsumers(bus, app.get<RealtimeBroker>(PLATFORM_REALTIME));
    });
    await h.app.listen(0, "127.0.0.1");
    baseUrl = await h.app.getUrl();
    const product = await h.call<{ variantIds: string[] }>(h.ownerA, "POST", "/v1/products", {
      name: "Serum",
      outletId: h.ownerA.outletId,
      variants: [{ price: 125_000, cost: 60_000, initialStock: 10 }],
    });
    variantId = product.body.variantIds[0]!;
    await h.drain();
  }, 120_000);

  afterAll(async () => {
    await h?.close();
  });

  /** Opens the real SSE endpoint over HTTP and resolves with the first `event` of the given name. */
  async function waitForEvent(name: string, actor = h.cashierA, timeoutMs = 5_000) {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/v1/events/stream`, {
      headers: { authorization: `Bearer ${actor.token}`, "x-tenant-id": actor.tenantId, origin: "http://localhost:3000" },
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let buffer = "";
    const ready = reader.read().then((chunk) => {
      buffer += decoder.decode(chunk.value);
    });
    const message = (async () => {
      await ready;
      for (;;) {
        const match = new RegExp(`event: ${name}\\ndata: (.*)\\n\\n`).exec(buffer);
        if (match) return JSON.parse(match[1]!) as Record<string, unknown>;
        const chunk = await reader.read();
        if (chunk.done) throw new Error("stream closed");
        buffer += decoder.decode(chunk.value);
      }
    })().finally(() => {
      clearTimeout(timer);
      controller.abort();
    });
    return { res, ready, message };
  }

  it("QRIS: order completes unpaid → intent → paid (webhook twice) → LUNAS + realtime + ledger, within 3 s", async () => {
    const order = await h.call<OrderView>(h.cashierA, "POST", "/v1/orders", {
      outletId: h.ownerA.outletId,
      lines: [{ variantId, qty: 1 }],
      payment: { method: "qris" },
    });
    expect(order.body).toMatchObject({ net: 125_000, paymentStatus: "unpaid" });

    const intent = await h.call<PaymentIntentView>(h.cashierA, "POST", "/v1/payments/qris", { orderId: order.body.id });
    expect(intent.status).toBe(201);
    expect(intent.body).toMatchObject({ amount: 125_000, status: "pending", simulated: true });
    const again = await h.call<PaymentIntentView>(h.cashierA, "POST", "/v1/payments/qris", { orderId: order.body.id });
    expect(again.body.id).toBe(intent.body.id); // re-opening the QR reuses the pending intent
    await h.drain();

    const stream = await waitForEvent("payment.received");
    expect(stream.res.headers.get("content-type")).toContain("text/event-stream");
    expect(stream.res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    await stream.ready;

    const started = Date.now();
    const paid = await h.call<{ result: string }>(h.cashierA, "POST", `/v1/payments/intents/${intent.body.id}/simulate-paid`);
    expect(paid.body.result).toBe("recorded");
    const duplicate = await h.call<{ result: string }>(h.cashierA, "POST", `/v1/payments/intents/${intent.body.id}/simulate-paid`);
    expect(duplicate.body.result).toBe("duplicate");
    await h.drain({ deliverTwice: true });

    const pushed = await stream.message;
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(pushed).toMatchObject({
      orderId: order.body.id,
      amount: 125_000,
      source: "QRIS",
      speech: "Uang masuk seratus dua puluh lima ribu rupiah dari QRIS",
    });

    const after = await h.call<OrderView>(h.ownerA, "GET", `/v1/orders/${order.body.id}`);
    expect(after.body).toMatchObject({ paymentStatus: "paid", paid: 125_000 });
    const status = await h.call<PaymentIntentView>(h.cashierA, "GET", `/v1/payments/intents/${intent.body.id}`);
    expect(status.body.status).toBe("paid");

    const wallets = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
    expect(wallets.find((w) => w.defaultFor === "qris")!.balance).toBe(125_000);
    const receivable = await h.migrateDb.execute(sql`
      select coalesce(sum(l.debit - l.credit), 0)::int as balance from finance.journal_lines l
      join finance.accounts a on a.id = l.account_id where a.tenant_id = ${h.ownerA.tenantId} and a.code = 'receivable'`);
    expect(receivable.rows[0]!.balance).toBe(0);

    const postings = await h.migrateDb.execute(sql`
      select count(*)::int as n from finance.journal_entries where tenant_id = ${h.ownerA.tenantId} and source_type = 'payment'`);
    expect(postings.rows[0]!.n).toBe(1); // duplicate webhook → no double posting (DoD)

    const incoming = await h.call<IncomingPaymentView[]>(h.cashierA, "GET", "/v1/payments/incoming?limit=1");
    expect(incoming.body[0]).toMatchObject({ amount: 125_000, orderNumber: order.body.orderNumber, source: "QRIS" });
  });

  it("refuses a QRIS for a paid order and 404s the simulator for another tenant's intent", async () => {
    const cash = await h.call<OrderView>(h.cashierA, "POST", "/v1/orders", {
      outletId: h.ownerA.outletId,
      lines: [{ variantId, qty: 1 }],
      payment: { method: "cash", tendered: 125_000 },
    });
    const refused = await h.call(h.cashierA, "POST", "/v1/payments/qris", { orderId: cash.body.id });
    expect(refused.status).toBe(422);

    const unpaid = await h.call<OrderView>(h.cashierA, "POST", "/v1/orders", {
      outletId: h.ownerA.outletId,
      lines: [{ variantId, qty: 1 }],
      payment: { method: "qris" },
    });
    const intent = await h.call<PaymentIntentView>(h.cashierA, "POST", "/v1/payments/qris", { orderId: unpaid.body.id });
    expect((await h.call(h.ownerB, "POST", `/v1/payments/intents/${intent.body.id}/simulate-paid`)).status).toBe(404);
    expect((await h.call(h.ownerB, "GET", `/v1/payments/intents/${intent.body.id}`)).status).toBe(404);
    expect((await h.call(h.ownerB, "POST", "/v1/payments/qris", { orderId: unpaid.body.id })).status).toBe(404);
  });

  it("the realtime stream is tenant-scoped: tenant B never receives tenant A's money", async () => {
    const otherTenant = await waitForEvent("payment.received", h.ownerB, 1_500);
    await otherTenant.ready;
    const order = await h.call<OrderView>(h.cashierA, "POST", "/v1/orders", {
      outletId: h.ownerA.outletId,
      lines: [{ variantId, qty: 1 }],
      payment: { method: "qris" },
    });
    const intent = await h.call<PaymentIntentView>(h.cashierA, "POST", "/v1/payments/qris", { orderId: order.body.id });
    await h.call(h.cashierA, "POST", `/v1/payments/intents/${intent.body.id}/simulate-paid`);
    await h.drain();
    await expect(otherTenant.message).rejects.toThrow();
  });

  it("the Xendit webhook rejects a missing/wrong callback token", async () => {
    const res = await h.call(undefined, "POST", "/v1/webhooks/xendit", { event: "qr.payment", data: {} }, { "x-callback-token": "nope" });
    expect(res.status).toBe(403);
  });

  it("cashiers can read the latest incoming money (Layar Kasir) but stream requires auth", async () => {
    const res = await fetch(`${baseUrl}/v1/events/stream`, { headers: { "x-tenant-id": h.ownerA.tenantId } });
    expect(res.status).toBe(401);
    const idempotent = await h.call(h.cashierA, "POST", "/v1/payments/qris", { orderId: randomUUID() });
    expect(idempotent.status).toBe(404);
  });
});
