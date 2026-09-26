import { ModulesContainer } from "@nestjs/core";
import type { OrderListPage, OrderView, PublicReceipt, StockItemView } from "@wadar/contracts";
import { registerInventoryConsumers } from "@wadar/inventory";
import { assertRouteIsolated, discoverTenantScopedRoutes, getRegisteredWriteIsolationCases, withTenantContext } from "@wadar/platform";
import { registerSalesConsumers } from "@wadar/sales";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./testing/harness.js";

describe("M3 — kasir (POS) & order events (real Postgres + RLS)", () => {
  let h: Harness;
  const variant: Record<string, string> = {};

  async function onHand(sku: string): Promise<number> {
    const res = await h.call<StockItemView[]>(h.ownerA, "GET", `/v1/stock?outletId=${h.ownerA.outletId}`);
    return res.body.find((s) => s.sku === sku)!.onHand;
  }

  function checkout(body: Record<string, unknown>, key = randomUUID(), actor = h.cashierA) {
    return h.call<OrderView>(actor, "POST", "/v1/orders", { outletId: h.ownerA.outletId, ...body }, { "idempotency-key": key });
  }

  beforeAll(async () => {
    h = await createHarness((bus) => {
      registerInventoryConsumers(bus);
      registerSalesConsumers(bus);
    });
    for (const [name, sku, price, cost, stock] of [
      ["Serum Vit C", "SVC", 89_000, 45_000, 12],
      ["Toner", "TNR", 65_000, 30_000, 30],
      ["Masker", "MSK", 15_000, 6_000, 50],
    ] as const) {
      const res = await h.call<{ variantIds: string[] }>(h.ownerA, "POST", "/v1/products", {
        name,
        outletId: h.ownerA.outletId,
        variants: [{ sku, price, cost, initialStock: stock }],
      });
      variant[sku] = res.body.variantIds[0]!;
    }
    await h.drain();
  }, 120_000);

  afterAll(async () => {
    await h?.close();
  });

  it("3-item cash sale: prices from the catalog, change computed, stock drops within 1 s of completion", async () => {
    const res = await checkout({
      lines: [
        { variantId: variant.SVC, qty: 1 },
        { variantId: variant.TNR, qty: 2, discount: 5_000 },
        { variantId: variant.MSK, qty: 3 },
      ],
      discount: 4_000,
      payment: { method: "cash", tendered: 300_000 },
    });
    expect(res.status).toBe(201);
    // 89.000 + 130.000 − 5.000 + 45.000 = 259.000 − 4.000 = 255.000
    expect(res.body).toMatchObject({ gross: 264_000, discount: 9_000, net: 255_000, paid: 255_000, change: 45_000, paymentStatus: "paid", status: "completed" });
    expect(res.body.orderNumber).toMatch(/^\d{6}-001$/);
    expect(res.body).not.toHaveProperty("cost"); // cashier: no HPP

    const started = Date.now();
    await h.drain();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(await onHand("SVC")).toBe(11);
    expect(await onHand("TNR")).toBe(28);
    expect(await onHand("MSK")).toBe(47);
  });

  it("the same Idempotency-Key twice creates exactly one order and deducts stock once", async () => {
    const key = randomUUID();
    const body = { lines: [{ variantId: variant.MSK, qty: 1 }], payment: { method: "cash", tendered: 20_000 } };
    const [first, second] = await Promise.all([checkout(body, key), checkout(body, key)]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    const third = await checkout(body, key);
    expect(third.body.id).toBe(first.body.id);

    const count = await h.migrateDb.execute(sql`select count(*)::int as n from sales.orders where idempotency_key = ${key}`);
    expect(count.rows[0]!.n).toBe(1);
    await h.drain({ deliverTwice: true });
    expect(await onHand("MSK")).toBe(46);
  });

  it("rejects cash below the total and unknown products", async () => {
    const short = await checkout({ lines: [{ variantId: variant.SVC, qty: 1 }], payment: { method: "cash", tendered: 50_000 } });
    expect(short.status).toBe(422);
    expect(short.body).toMatchObject({ code: "CASH_NOT_ENOUGH" });
    const unknown = await checkout({ lines: [{ variantId: randomUUID(), qty: 1 }], payment: { method: "transfer" } });
    expect(unknown.status).toBe(422);
    expect(unknown.body).toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });

  it("QRIS orders complete unpaid (payment arrives later via the payments module)", async () => {
    const res = await checkout({ lines: [{ variantId: variant.TNR, qty: 1 }], payment: { method: "qris" } });
    expect(res.body).toMatchObject({ net: 65_000, paid: 0, paymentStatus: "unpaid" });
  });

  it("cashiers can't void; the owner can, stock returns, and a second void is refused", async () => {
    const sale = await checkout({ lines: [{ variantId: variant.SVC, qty: 2 }], payment: { method: "transfer" } });
    await h.drain();
    expect(await onHand("SVC")).toBe(9);

    const denied = await h.call(h.cashierA, "POST", `/v1/orders/${sale.body.id}/void`, { reason: "salah input" });
    expect(denied.status).toBe(403);

    const voided = await h.call<OrderView>(h.ownerA, "POST", `/v1/orders/${sale.body.id}/void`, { reason: "salah input" });
    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ status: "voided", voidReason: "salah input" });
    await h.drain();
    expect(await onHand("SVC")).toBe(11);

    const again = await h.call(h.ownerA, "POST", `/v1/orders/${sale.body.id}/void`, { reason: "lagi" });
    expect(again.status).toBe(409);

    const audit = await h.migrateDb.execute(
      sql`select count(*)::int as n from platform.audit_log where action = 'order.voided' and entity = ${`order:${sale.body.id}`}`,
    );
    expect(audit.rows[0]!.n).toBe(1);
  });

  it("public receipt link works without login and can't be forged", async () => {
    const sale = await checkout({ lines: [{ variantId: variant.MSK, qty: 2 }], payment: { method: "cash", tendered: 50_000 } });
    const receipt = await h.call<PublicReceipt>(undefined, "GET", `/v1/public/receipts/${sale.body.receiptToken}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({ storeName: "Toko A", net: 30_000, change: 20_000, status: "completed" });

    const [body] = sale.body.receiptToken.split(".");
    const forged = await h.call(undefined, "GET", `/v1/public/receipts/${body}.AAAAAAAAAAAAAAAAAAAAAA`);
    expect(forged.status).toBe(404);
  });

  it("marketplace commission from channel settings is snapshotted on the order", async () => {
    const set = await h.call(h.ownerA, "PUT", "/v1/sales/channels", { channel: "shopee", commissionBps: 1_000 });
    expect(set.status).toBe(200);
    const sale = await checkout(
      { channel: "shopee", lines: [{ variantId: variant.TNR, qty: 1 }], payment: { method: "transfer" } },
      randomUUID(),
      h.ownerA,
    );
    expect(sale.body).toMatchObject({ net: 65_000, commission: 6_500, cost: 30_000 });
  });

  it("lists orders newest first with cursor pagination", async () => {
    const first = await h.call<OrderListPage>(h.ownerA, "GET", "/v1/orders?limit=2");
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await h.call<OrderListPage>(h.ownerA, "GET", `/v1/orders?limit=2&cursor=${first.body.nextCursor}`);
    const ids = [...first.body.items, ...second.body.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.body.items[0]!.completedAt >= second.body.items[0]!.completedAt).toBe(true);
  });

  describe("tenant isolation", () => {
    it("tenant B can't read tenant A's orders through any GET route", async () => {
      const page = await h.call<OrderListPage>(h.ownerA, "GET", "/v1/orders?limit=1");
      const orderId = page.body.items[0]!.id;
      for (const route of discoverTenantScopedRoutes(h.app.get(ModulesContainer))) {
        const path = route.path.replace(":id", orderId).replace(":variantId", variant.SVC!);
        await assertRouteIsolated(h.inject, { ...route, path: `${path}?outletId=${h.ownerA.outletId}` }, {
          foreignTenantId: h.ownerB.tenantId,
          foreignAuthHeaders: { authorization: `Bearer ${h.ownerB.token}` },
          secretsThatMustNotLeak: ["Serum Vit C", page.body.items[0]!.orderNumber, "Toko A"],
        });
      }
    });

    it("tenant B can't sell tenant A's products or void tenant A's orders", async () => {
      const sell = await checkout(
        { outletId: h.ownerB.outletId, lines: [{ variantId: variant.SVC, qty: 1 }], payment: { method: "transfer" } },
        randomUUID(),
        h.ownerB,
      );
      expect(sell.status).toBe(422);
      for (const testCase of getRegisteredWriteIsolationCases()) {
        const fixture = await withTenantContext(h.migrateDb, h.ownerA.tenantId, (tx) => testCase.createFixture(tx, h.ownerA.tenantId));
        const res = await h.call(h.ownerB, testCase.method, testCase.path(fixture.id), testCase.body ?? {});
        expect([403, 404], `${testCase.module} ${testCase.method} → ${res.status} ${res.raw}`).toContain(res.status);
      }
    });
  });
});
