import type { HomeView, OrderView, PaymentIntentView, ProfitAndLoss, ProfitBreakdown, SummaryView, WalletView } from "@wadar/contracts";
import { registerFinanceConsumers } from "@wadar/finance";
import { reconcileTenant, registerInsightsConsumers } from "@wadar/insights";
import { registerForecastConsumer, registerInventoryConsumers } from "@wadar/inventory";
import { PLATFORM_DB, type Db } from "@wadar/platform";
import { registerSalesConsumers } from "@wadar/sales";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./testing/harness.js";

describe("M6 — insights & dasbor keuangan (real Postgres + RLS)", () => {
  let h: Harness;
  const v: Record<string, string> = {};

  const sell = (lines: Array<{ variantId: string; qty: number }>, payment: Record<string, unknown>, channel = "pos") =>
    h.call<OrderView>(h.ownerA, "POST", "/v1/orders", { outletId: h.ownerA.outletId, channel, lines, payment }, { "idempotency-key": randomUUID() });

  beforeAll(async () => {
    h = await createHarness((bus) => {
      registerInventoryConsumers(bus);
      registerForecastConsumer(bus);
      registerSalesConsumers(bus);
      registerFinanceConsumers(bus);
      registerInsightsConsumers(bus);
    });
    for (const [key, name, price, cost, stock] of [
      ["X", "Kaos Oversize", 100_000, 55_000, 20],
      ["Y", "Topi Tanpa HPP", 50_000, undefined, 5],
      ["Z", "Serum Laris", 80_000, 30_000, 6],
    ] as const) {
      const res = await h.call<{ variantIds: string[] }>(h.ownerA, "POST", "/v1/products", {
        name,
        outletId: h.ownerA.outletId,
        variants: [{ price, cost, initialStock: stock }],
      });
      v[key] = res.body.variantIds[0]!;
    }
    await h.call(h.ownerA, "PUT", "/v1/sales/channels", { channel: "shopee", commissionBps: 1_000 });
    await h.drain();

    await sell([{ variantId: v.X!, qty: 3 }], { method: "cash", tendered: 300_000 });
    await sell([{ variantId: v.Y!, qty: 1 }], { method: "transfer" });
    await sell([{ variantId: v.Z!, qty: 5 }], { method: "cash", tendered: 400_000 });
    await sell([{ variantId: v.X!, qty: 1 }], { method: "transfer" }, "shopee");
    const qris = await sell([{ variantId: v.X!, qty: 2 }], { method: "qris" });
    const intent = await h.call<PaymentIntentView>(h.ownerA, "POST", "/v1/payments/qris", { orderId: qris.body.id });
    await h.call(h.ownerA, "POST", `/v1/payments/intents/${intent.body.id}/simulate-paid`);
    const toVoid = await sell([{ variantId: v.X!, qty: 1 }], { method: "cash", tendered: 100_000 });
    const wallets = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
    await h.call(h.ownerA, "POST", "/v1/finance/expenses", { amount: 40_000, category: "exp_ads", walletId: wallets[0]!.id, note: "iklan" });
    await h.drain();
    await h.call(h.ownerA, "POST", `/v1/orders/${toVoid.body.id}/void`, { reason: "batal" });
    await h.drain({ deliverTwice: true });
  }, 180_000);

  afterAll(async () => {
    await h?.close();
  });

  it("DoD: Beranda cards equal the ledger (money in, profit, total balance)", async () => {
    const home = (await h.call<HomeView>(h.ownerA, "GET", `/v1/insights/home?outletId=${h.ownerA.outletId}`)).body;
    const ledger = (await h.call<ProfitAndLoss>(h.ownerA, "GET", "/v1/finance/profit-and-loss")).body;
    const wallets = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;

    expect(home.cards!.profit.today).toBe(ledger.netProfit);
    expect(home.cards!.balance.total).toBe(wallets.reduce((s, w) => s + w.balance, 0));
    // Money in today: 300k + 50k + 400k + 90k (Shopee pays out net of its 10% commission)
    // + 200k QRIS + 100k (the voided sale — the refund is money OUT, not a reduction of money in).
    expect(home.cards!.moneyIn.today).toBe(1_140_000);
    // Hand check: net sales 600k (Kaos, void excluded) + 50k (Topi) + 400k (Serum) = 1.050k
    // − HPP 6×55k + 5×30k = 480k − Shopee commission 10k − expense 40k = 520k.
    expect(ledger.netProfit).toBe(520_000);
    expect(home.cards!.profit.sentence).toBe("Dari setiap Rp100 penjualan, untungnya Rp50.");
    expect(home.chart).toHaveLength(7);
    expect(home.chart.at(-1)).toMatchObject({ day: home.today, moneyIn: 1_140_000, profit: ledger.netProfit });
  });

  it("the nightly reconciliation job finds aggregates == ledger", async () => {
    const results = await reconcileTenant(h.app.get<Db>(PLATFORM_DB), h.ownerA.tenantId, "Asia/Jakarta");
    for (const result of results) expect(result, JSON.stringify(result.differences)).toMatchObject({ ok: true });
  });

  it("DoD: action feed comes first and includes low stock with a day estimate + catalog quality", async () => {
    const home = (await h.call<HomeView>(h.ownerA, "GET", `/v1/insights/home?outletId=${h.ownerA.outletId}`)).body;
    const stock = home.feed.find((f) => f.kind === "stock" && f.title.startsWith("Serum Laris"));
    expect(stock, JSON.stringify(home.feed)).toMatchObject({ title: expect.stringMatching(/^Serum Laris habis ±\d+ hari lagi$/), severity: "critical" });
    expect(home.feed.find((f) => f.id === "quality:cost")).toMatchObject({ title: "1 produk belum ada modal (HPP)" });
    const severities = home.feed.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ["critical", "warning", "info"].indexOf(a) - ["critical", "warning", "info"].indexOf(b)));
  });

  it("profit per product and per channel after HPP, discounts and commission (F3.3)", async () => {
    const byProduct = (await h.call<ProfitBreakdown>(h.ownerA, "GET", "/v1/insights/profit?by=product")).body;
    const kaos = byProduct.rows.find((r) => r.name === "Kaos Oversize")!;
    // 6 units kept (1 voided): net 600k − HPP 330k − shopee commission 10k.
    expect(kaos).toMatchObject({ qty: 6, netSales: 600_000, cost: 330_000, commission: 10_000, profit: 260_000 });
    expect(byProduct.missingCostCount).toBe(1);

    const byChannel = (await h.call<ProfitBreakdown>(h.ownerA, "GET", "/v1/insights/profit?by=channel")).body;
    expect(byChannel.rows.find((r) => r.key === "shopee")).toMatchObject({ orders: 1, netSales: 100_000, commission: 10_000, profit: 35_000 });
  });

  it("Keuangan summary from aggregates matches the ledger P&L", async () => {
    const summary = (await h.call<SummaryView>(h.ownerA, "GET", "/v1/insights/summary")).body;
    const ledger = (await h.call<ProfitAndLoss>(h.ownerA, "GET", "/v1/finance/profit-and-loss")).body;
    expect(summary).toMatchObject({
      sales: ledger.sales,
      discounts: ledger.discounts,
      costOfGoods: ledger.costOfGoods,
      channelCommission: ledger.channelCommission,
      expenses: ledger.expenses,
      netProfit: ledger.netProfit,
    });
    expect(summary.expensesByCategory).toEqual(ledger.expensesByCategory);
  });

  it("cashiers get the feed but no money cards; tenant B sees none of tenant A's numbers", async () => {
    const cashier = (await h.call<HomeView>(h.cashierA, "GET", `/v1/insights/home?outletId=${h.ownerA.outletId}`)).body;
    expect(cashier.cards).toBeNull();
    expect(cashier.feed.length).toBeGreaterThan(0);
    expect((await h.call(h.cashierA, "GET", "/v1/insights/profit")).status).toBe(403);

    const other = (await h.call<HomeView>(h.ownerB, "GET", `/v1/insights/home?outletId=${h.ownerA.outletId}`)).body;
    expect(other.cards!.moneyIn.today).toBe(0);
    expect(other.feed.some((f) => f.title.includes("Serum Laris"))).toBe(false);
  });
});
