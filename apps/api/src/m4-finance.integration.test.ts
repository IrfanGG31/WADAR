import type { MoneyMovement, OrderView, ProfitAndLoss, WalletView } from "@wadar/contracts";
import { registerFinanceConsumers } from "@wadar/finance";
import { registerInventoryConsumers } from "@wadar/inventory";
import { getRegisteredWriteIsolationCases, withTenantContext } from "@wadar/platform";
import { registerSalesConsumers } from "@wadar/sales";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./testing/harness.js";

describe("M4 — ledger & keuangan dasar (real Postgres + RLS + DB triggers)", () => {
  let h: Harness;
  let A: string;
  let B: string;
  let wallets: WalletView[];
  const byName = (name: string) => wallets.find((w) => w.name === name)!;

  const sell = (lines: Array<{ variantId: string; qty: number; discount?: number }>, payment: Record<string, unknown>, discount = 0) =>
    h.call<OrderView>(h.ownerA, "POST", "/v1/orders", { outletId: h.ownerA.outletId, lines, discount, payment }, { "idempotency-key": randomUUID() });

  beforeAll(async () => {
    h = await createHarness((bus) => {
      registerInventoryConsumers(bus);
      registerSalesConsumers(bus);
      registerFinanceConsumers(bus);
    });
    const a = await h.call<{ variantIds: string[] }>(h.ownerA, "POST", "/v1/products", {
      name: "Produk A",
      outletId: h.ownerA.outletId,
      variants: [{ price: 50_000, cost: 30_000, initialStock: 100 }],
    });
    const b = await h.call<{ variantIds: string[] }>(h.ownerA, "POST", "/v1/products", {
      name: "Produk B",
      outletId: h.ownerA.outletId,
      variants: [{ price: 20_000, cost: 8_000, initialStock: 100 }],
    });
    A = a.body.variantIds[0]!;
    B = b.body.variantIds[0]!;
    await h.drain();
    wallets = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
  }, 120_000);

  afterAll(async () => {
    await h?.close();
  });

  it("every tenant gets a chart of accounts and the 3 default wallets at onboarding", () => {
    expect(wallets.map((w) => [w.name, w.defaultFor, w.balance])).toEqual([
      ["Kas Laci", "cash", 0],
      ["Rekening Bank", "transfer", 0],
      ["QRIS", "qris", 0],
    ]);
  });

  it("DoD: 10 sales + 3 expenses → profit & loss equals the hand-computed fixture", async () => {
    const cash = (tendered: number) => ({ method: "cash", tendered });
    const results = [
      await sell([{ variantId: A, qty: 1 }], cash(50_000)),
      await sell([{ variantId: B, qty: 2 }], cash(40_000)),
      await sell([{ variantId: A, qty: 2, discount: 10_000 }], cash(100_000)),
      await sell([{ variantId: B, qty: 1 }], cash(20_000)),
      await sell([{ variantId: A, qty: 1 }, { variantId: B, qty: 1 }], cash(65_000), 5_000),
      await sell([{ variantId: B, qty: 3 }], { method: "transfer" }),
      await sell([{ variantId: A, qty: 1 }], { method: "qris" }),
      await sell([{ variantId: B, qty: 1 }], cash(20_000)),
      await sell([{ variantId: A, qty: 3 }], cash(150_000)),
      await sell([{ variantId: B, qty: 2 }], cash(50_000)),
    ];
    results.forEach((r) => expect(r.status, r.raw).toBe(201));
    const voided = await h.call(h.ownerA, "POST", `/v1/orders/${results[9]!.body.id}/void`, { reason: "salah input" });
    expect(voided.status).toBe(200);

    for (const [amount, category, wallet, note] of [
      [50_000, "exp_utilities", "Kas Laci", "token listrik"],
      [15_000, "exp_supplies", "Kas Laci", "plastik"],
      [30_000, "exp_ads", "Rekening Bank", "boost iklan"],
    ] as const) {
      const res = await h.call(h.ownerA, "POST", "/v1/finance/expenses", { amount, category, walletId: byName(wallet).id, note });
      expect(res.status, res.raw).toBe(201);
    }
    await h.drain({ deliverTwice: true });

    const pnl = (await h.call<ProfitAndLoss>(h.ownerA, "GET", "/v1/finance/profit-and-loss")).body;
    // Gross 600.000 − voided 40.000 = 560.000; discounts 10.000 + 5.000.
    // HPP: 8 × A @30.000 + 8 × B @8.000 = 304.000. Expenses 95.000.
    expect(pnl).toMatchObject({
      sales: 560_000,
      discounts: 15_000,
      netSales: 545_000,
      costOfGoods: 304_000,
      channelCommission: 0,
      expenses: 95_000,
      otherIncome: 0,
      netProfit: 146_000,
    });
    expect(pnl.expensesByCategory.map((c) => [c.category, c.amount])).toEqual([
      ["exp_utilities", 50_000],
      ["exp_ads", 30_000],
      ["exp_supplies", 15_000],
    ]);

    wallets = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
    // Cash: 435.000 sales (the voided 40.000 went in and back out) − 65.000 expenses.
    expect(byName("Kas Laci").balance).toBe(370_000);
    expect(byName("Rekening Bank").balance).toBe(30_000);
    expect(byName("QRIS").balance).toBe(0); // the QRIS order is still owed (receivable)
  });

  it("every journal entry is balanced and there are no duplicate postings despite double delivery", async () => {
    const unbalanced = await h.migrateDb.execute(sql`
      select e.id from finance.journal_entries e join finance.journal_lines l on l.entry_id = e.id
      where e.tenant_id = ${h.ownerA.tenantId} group by e.id having sum(l.debit) <> sum(l.credit)`);
    expect(unbalanced.rows).toHaveLength(0);
    const perOrder = await h.migrateDb.execute(sql`
      select source_id, count(*)::int as n from finance.journal_entries
      where tenant_id = ${h.ownerA.tenantId} and source_type = 'order' group by source_id having count(*) > 1`);
    expect(perOrder.rows).toHaveLength(0);
  });

  it("the database itself rejects an unbalanced entry and any edit of posted lines — even for the app role", async () => {
    const appPool = new Pool({ connectionString: h.infra.appUrl });
    const appDb = drizzle(appPool) as unknown as typeof h.migrateDb;
    try {
      const accounts = await withTenantContext(appDb, h.ownerA.tenantId, (tx) =>
        tx.execute(sql`select id from finance.accounts where tenant_id = ${h.ownerA.tenantId} limit 2`),
      );
      const [a1, a2] = accounts.rows.map((r) => r.id as string);
      await expect(
        withTenantContext(appDb, h.ownerA.tenantId, async (tx) => {
          const entryId = randomUUID();
          await tx.execute(sql`insert into finance.journal_entries (id, tenant_id, occurred_at, source_type, source_id, description, created_by)
            values (${entryId}, ${h.ownerA.tenantId}, now(), 'test', ${entryId}, 'x', 'test')`);
          await tx.execute(sql`insert into finance.journal_lines (id, tenant_id, entry_id, account_id, debit, credit) values
            (${randomUUID()}, ${h.ownerA.tenantId}, ${entryId}, ${a1}, 1000, 0),
            (${randomUUID()}, ${h.ownerA.tenantId}, ${entryId}, ${a2}, 0, 999)`);
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        withTenantContext(appDb, h.ownerA.tenantId, (tx) =>
          tx.execute(sql`update finance.journal_lines set debit = debit + 1 where tenant_id = ${h.ownerA.tenantId} and debit > 0`),
        ),
      ).rejects.toMatchObject({ cause: { code: "42501" } });
    } finally {
      await appPool.end();
    }
  });

  it("transfers keep the total, balance corrections post the difference, expense voids reverse", async () => {
    const before = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
    const total = (ws: WalletView[]) => ws.reduce((s, w) => s + w.balance, 0);

    const moved = await h.call(h.ownerA, "POST", "/v1/finance/transfers", { fromWalletId: byName("Kas Laci").id, toWalletId: byName("Rekening Bank").id, amount: 100_000 });
    expect(moved.status).toBe(201);
    const afterTransfer = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
    expect(total(afterTransfer)).toBe(total(before));
    expect(afterTransfer.find((w) => w.name === "Kas Laci")!.balance).toBe(270_000);

    const adjusted = await h.call<{ delta: number }>(h.ownerA, "POST", `/v1/finance/wallets/${byName("Kas Laci").id}/balance`, { actualBalance: 268_000, note: "hitung laci" });
    expect(adjusted.body.delta).toBe(-2_000);

    const expense = await h.call<{ expenseId: string }>(h.ownerA, "POST", "/v1/finance/expenses", { amount: 12_000, category: "exp_other", walletId: byName("Kas Laci").id });
    const voided = await h.call(h.ownerA, "POST", `/v1/finance/expenses/${expense.body.expenseId}/void`, { reason: "dobel" });
    expect(voided.status).toBe(200);
    const final = (await h.call<WalletView[]>(h.ownerA, "GET", "/v1/finance/wallets")).body;
    expect(final.find((w) => w.name === "Kas Laci")!.balance).toBe(268_000);
    const pnl = (await h.call<ProfitAndLoss>(h.ownerA, "GET", "/v1/finance/profit-and-loss")).body;
    expect(pnl.expenses).toBe(95_000); // the voided one nets to zero; transfers/corrections aren't expenses
  });

  it("money-in/out list reads in plain terms and shows the void as money out", async () => {
    const movements = (await h.call<MoneyMovement[]>(h.ownerA, "GET", `/v1/finance/movements?walletId=${byName("Kas Laci").id}`)).body;
    expect(movements.some((m) => m.description.startsWith("Penjualan #") && m.amount > 0)).toBe(true);
    expect(movements.some((m) => m.description.startsWith("Batal penjualan #") && m.amount === -40_000)).toBe(true);
  });

  it("learns the store's expense categories (PRD F2.3)", async () => {
    const builtIn = await h.call<{ category: string; source: string }>(h.ownerA, "GET", "/v1/finance/expense-category-suggestion?note=bayar%20listrik");
    expect(builtIn.body).toEqual({ category: "exp_utilities", source: "keyword" });
    await h.call(h.ownerA, "POST", "/v1/finance/expenses", { amount: 5_000, category: "exp_operational", walletId: byName("Kas Laci").id, note: "kopi karyawan" });
    const learned = await h.call<{ category: string; source: string }>(h.ownerA, "GET", "/v1/finance/expense-category-suggestion?note=kopi%202%20kg");
    expect(learned.body).toEqual({ category: "exp_operational", source: "rule" });
  });

  it("cashiers can't see finance; tenant B can't see or touch tenant A's wallets", async () => {
    expect((await h.call(h.cashierA, "GET", "/v1/finance/wallets")).status).toBe(403);
    const other = await h.call<WalletView[]>(h.ownerB, "GET", "/v1/finance/wallets");
    expect(other.body.every((w) => w.balance === 0)).toBe(true);
    const spend = await h.call(h.ownerB, "POST", "/v1/finance/expenses", { amount: 1_000, category: "exp_other", walletId: byName("Kas Laci").id });
    expect(spend.status).toBe(404);
    for (const testCase of getRegisteredWriteIsolationCases().filter((c) => c.module === "finance")) {
      const fixture = await withTenantContext(h.migrateDb, h.ownerA.tenantId, (tx) => testCase.createFixture(tx, h.ownerA.tenantId));
      const res = await h.call(h.ownerB, testCase.method, testCase.path(fixture.id), testCase.body);
      expect([403, 404], `${testCase.method} ${res.status} ${res.raw}`).toContain(res.status);
    }
  });
});
