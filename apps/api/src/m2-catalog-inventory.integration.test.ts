import { ModulesContainer } from "@nestjs/core";
import type { ImportProductsResult, ProductView, StockItemView, StockMovementView } from "@wadar/contracts";
import { registerInventoryConsumers } from "@wadar/inventory";
import { assertRouteIsolated, discoverTenantScopedRoutes, getRegisteredWriteIsolationCases, withTenantContext } from "@wadar/platform";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./testing/harness.js";

describe("M2 — catalog & inventory (real Postgres + RLS)", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness((bus) => registerInventoryConsumers(bus));
  }, 120_000);

  afterAll(async () => {
    await h?.close();
  });

  async function stock(outletId = h.ownerA.outletId) {
    const res = await h.call<StockItemView[]>(h.ownerA, "GET", `/v1/stock?outletId=${outletId}`);
    expect(res.status).toBe(200);
    return res.body;
  }

  it("creates a product with variants; opening stock arrives via catalog.product.created → inventory", async () => {
    const res = await h.call<{ productId: string; variantIds: string[] }>(h.ownerA, "POST", "/v1/products", {
      name: "Serum Vit C",
      category: "Skincare",
      outletId: h.ownerA.outletId,
      variants: [
        { name: "20ml", sku: "SVC-20", barcode: "8991000000017", price: 89_000, cost: 45_000, initialStock: 12 },
        { name: "50ml", sku: "SVC-50", price: 159_000, initialStock: 0 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.variantIds).toHaveLength(2);

    // Nothing moves until the worker processes the event (async by design).
    expect((await stock()).find((s) => s.sku === "SVC-20")?.onHand).toBe(0);
    await h.drain({ deliverTwice: true });

    const items = await stock();
    const small = items.find((s) => s.sku === "SVC-20")!;
    expect(small.onHand).toBe(12); // delivered twice, applied once (idempotent consumer)
    expect(small.avgCost).toBe(45_000);
    expect(small.status).toBe("aman");
    const big = items.find((s) => s.sku === "SVC-50")!;
    expect(big.onHand).toBe(0);
    expect(big.status).toBe("kritis");
    expect(big.missing).toContain("cost");
  });

  it("rejects a duplicate SKU (case-insensitive) with 409", async () => {
    const res = await h.call(h.ownerA, "POST", "/v1/products", {
      name: "Serum Palsu",
      outletId: h.ownerA.outletId,
      variants: [{ sku: "svc-20", price: 1000 }],
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "DUPLICATE_SKU" });
  });

  it("receiving stock with a purchase cost updates the moving-average HPP; opname records the difference", async () => {
    const variant = (await stock()).find((s) => s.sku === "SVC-20")!;
    const receive = await h.call(h.ownerA, "POST", "/v1/stock/adjustments", {
      mode: "receive",
      outletId: h.ownerA.outletId,
      variantId: variant.variantId,
      quantity: 8,
      unitCost: 50_000,
    });
    expect(receive.status).toBe(201);
    // (12 × 45.000 + 8 × 50.000) / 20 = 47.000
    expect(receive.body).toMatchObject({ onHand: 20, avgCost: 47_000 });

    const opname = await h.call(h.ownerA, "POST", "/v1/stock/adjustments", {
      mode: "set",
      outletId: h.ownerA.outletId,
      variantId: variant.variantId,
      quantity: 17,
      note: "3 rusak",
    });
    expect(opname.status).toBe(201);
    expect(opname.body).toMatchObject({ onHand: 17, avgCost: 47_000 });

    const movements = await h.call<StockMovementView[]>(
      h.ownerA,
      "GET",
      `/v1/stock/variants/${variant.variantId}/movements?outletId=${h.ownerA.outletId}`,
    );
    expect(movements.body.map((m) => [m.reason, m.delta])).toEqual([
      ["adjustment", -3],
      ["purchase", 8],
      ["opening", 12],
    ]);
  });

  it("editing HPP in the catalog revalues the average cost", async () => {
    const variant = (await stock()).find((s) => s.sku === "SVC-20")!;
    const res = await h.call(h.ownerA, "PATCH", `/v1/variants/${variant.variantId}`, { cost: 48_000 });
    expect(res.status).toBe(200);
    await h.drain();
    expect((await stock()).find((s) => s.sku === "SVC-20")!.avgCost).toBe(48_000);
  });

  it("imports 500 products in well under 30 s and reports invalid rows with their row numbers", async () => {
    const rows: Array<Record<string, unknown>> = Array.from({ length: 500 }, (_, i) => ({
      "Nama Produk": `Kaos Seri ${i}`,
      Varian: i % 2 === 0 ? "M" : "L",
      SKU: `KS-${i}`,
      "Harga Jual": `Rp${50 + (i % 10)}.000`,
      HPP: "30.000",
      Stok: 5,
    }));
    rows.push({ "Nama Produk": "Rusak", "Harga Jual": "gratis" });
    rows.push({ "Nama Produk": "Dobel", "Harga Jual": 1000, SKU: "KS-1" });

    const preview = await h.call<ImportProductsResult>(h.ownerA, "POST", "/v1/products/import", {
      outletId: h.ownerA.outletId,
      dryRun: true,
      rows,
    });
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ dryRun: true, validRows: 500, productsCreated: 0 });
    expect(preview.body.errors).toEqual([
      { row: 502, message: "Harga harus berupa angka" },
      { row: 503, message: 'SKU "KS-1" dobel dengan baris 3' },
    ]);

    const started = Date.now();
    const result = await h.call<ImportProductsResult>(h.ownerA, "POST", "/v1/products/import", {
      outletId: h.ownerA.outletId,
      dryRun: false,
      rows,
    });
    await h.drain();
    const elapsed = Date.now() - started;
    expect(result.body).toMatchObject({ productsCreated: 500, variantsCreated: 500 });
    expect(elapsed).toBeLessThan(30_000);

    const items = await stock();
    expect(items.filter((s) => s.productName.startsWith("Kaos Seri"))).toHaveLength(500);
    expect(items.find((s) => s.sku === "KS-7")).toMatchObject({ onHand: 5, price: 57_000, avgCost: 30_000 });
  }, 60_000);

  it("stock_levels always equals Σ stock_movements for every variant", async () => {
    const [levels, sums] = await Promise.all([
      h.migrateDb.execute(sql`select variant_id, on_hand from inventory.stock_levels where tenant_id = ${h.ownerA.tenantId}`),
      h.migrateDb.execute(
        sql`select variant_id, sum(delta)::int as total from inventory.stock_movements where tenant_id = ${h.ownerA.tenantId} group by variant_id`,
      ),
    ]);
    const sumByVariant = new Map(sums.rows.map((r) => [r.variant_id as string, Number(r.total)]));
    expect(levels.rows.length).toBeGreaterThan(500);
    for (const level of levels.rows) {
      expect(Number(level.on_hand)).toBe(sumByVariant.get(level.variant_id as string) ?? 0);
    }
  });

  it("cashier sees products and stock but never HPP, and cannot create products", async () => {
    const products = await h.call<ProductView[]>(h.cashierA, "GET", "/v1/products?search=Serum");
    expect(products.status).toBe(200);
    expect(products.body[0]!.variants[0]).not.toHaveProperty("cost");
    const stockRes = await h.call<StockItemView[]>(h.cashierA, "GET", `/v1/stock?outletId=${h.ownerA.outletId}&search=Serum`);
    expect(stockRes.body[0]).not.toHaveProperty("avgCost");
    const create = await h.call(h.cashierA, "POST", "/v1/products", {
      name: "Coba",
      outletId: h.ownerA.outletId,
      variants: [{ price: 1000 }],
    });
    expect(create.status).toBe(403);
  });

  it("searches by exact barcode (scanner input)", async () => {
    const res = await h.call<ProductView[]>(h.ownerA, "GET", "/v1/products?search=8991000000017");
    expect(res.body.map((p) => p.name)).toEqual(["Serum Vit C"]);
  });

  describe("tenant isolation", () => {
    it("tenant B can't read tenant A's catalog/stock through any GET route", async () => {
      const routes = discoverTenantScopedRoutes(h.app.get(ModulesContainer));
      expect(routes.map((r) => r.path)).toEqual(expect.arrayContaining(["/v1/products", "/v1/stock"]));
      const productA = (await h.call<ProductView[]>(h.ownerA, "GET", "/v1/products?search=Serum")).body[0]!;
      for (const route of routes) {
        const path = route.path
          .replace(":id", productA.id)
          .replace(":variantId", productA.variants[0]!.id);
        await assertRouteIsolated(h.inject, { ...route, path: `${path}?outletId=${h.ownerA.outletId}` }, {
          foreignTenantId: h.ownerB.tenantId,
          foreignAuthHeaders: { authorization: `Bearer ${h.ownerB.token}` },
          secretsThatMustNotLeak: ["Serum Vit C", "SVC-20", "Toko A"],
        });
      }
    });

    it("tenant B can't modify tenant A's products/variants (registered write cases)", async () => {
      const cases = getRegisteredWriteIsolationCases();
      expect(cases.map((c) => c.module)).toEqual(expect.arrayContaining(["identity", "catalog"]));
      for (const testCase of cases) {
        const fixture = await withTenantContext(h.migrateDb, h.ownerA.tenantId, (tx) => testCase.createFixture(tx, h.ownerA.tenantId));
        const res = await h.call(h.ownerB, testCase.method, testCase.path(fixture.id), testCase.body ?? {});
        expect([403, 404], `${testCase.method} ${testCase.path(":id")} → ${res.status} ${res.raw}`).toContain(res.status);
      }
    });

    it("tenant B can't adjust tenant A's stock", async () => {
      const variant = (await stock()).find((s) => s.sku === "SVC-20")!;
      const res = await h.call(h.ownerB, "POST", "/v1/stock/adjustments", {
        mode: "receive",
        outletId: h.ownerB.outletId,
        variantId: variant.variantId,
        quantity: 100,
      });
      expect(res.status).toBe(404);
    });
  });
});
