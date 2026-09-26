import { describe, expect, it } from "vitest";
import {
  UnbalancedEntryError,
  finalize,
  postBalanceAdjustment,
  postExpense,
  postOrderCompleted,
  postPaymentReceived,
  profitFromKinds,
  reverse,
  type LedgerAccounts,
} from "./posting.js";

const A: LedgerAccounts = {
  receivable: "AR",
  inventory: "INV",
  equity: "EQ",
  revenue: "REV",
  discount: "DISC",
  cogs: "COGS",
  commission: "COMM",
  otherIncome: "OI",
};

const balanced = (lines: Array<{ debit: number; credit: number }>) =>
  lines.reduce((s, l) => s + l.debit, 0) === lines.reduce((s, l) => s + l.credit, 0);

describe("posting rules", () => {
  it("cash sale Rp100.000 with HPP Rp60.000 (ARCHITECTURE §5.2 example)", () => {
    const entry = postOrderCompleted(A, { orderNumber: "1", gross: 100_000, discount: 0, cost: 60_000, commission: 0, payments: [{ walletAccountId: "CASH", amount: 100_000 }], outstanding: 0 });
    expect(entry.lines).toEqual(
      expect.arrayContaining([
        { accountId: "CASH", debit: 100_000, credit: 0 },
        { accountId: "REV", debit: 0, credit: 100_000 },
        { accountId: "COGS", debit: 60_000, credit: 0 },
        { accountId: "INV", debit: 0, credit: 60_000 },
      ]),
    );
    expect(entry.lines).toHaveLength(4);
  });

  it("discounted marketplace sale: unpaid → receivable, commission reduces the receivable", () => {
    const entry = postOrderCompleted(A, { orderNumber: "2", gross: 200_000, discount: 20_000, cost: 90_000, commission: 18_000, payments: [], outstanding: 180_000 });
    expect(balanced(entry.lines)).toBe(true);
    expect(entry.lines).toContainEqual({ accountId: "AR", debit: 162_000, credit: 0 });
    expect(entry.lines).toContainEqual({ accountId: "COMM", debit: 18_000, credit: 0 });
  });

  it("reversal mirrors the original exactly", () => {
    const original = postOrderCompleted(A, { orderNumber: "3", gross: 50_000, discount: 5_000, cost: 20_000, commission: 0, payments: [{ walletAccountId: "CASH", amount: 45_000 }], outstanding: 0 });
    const reversed = reverse(original.lines, "Batal #3");
    for (const line of original.lines) {
      expect(reversed.lines).toContainEqual({ accountId: line.accountId, debit: line.credit, credit: line.debit });
    }
  });

  it("QRIS payment settles the receivable; any overpayment is other income", () => {
    const entry = postPaymentReceived(A, { walletAccountId: "QRIS", amount: 65_500, appliedToOrder: 65_000, description: "QRIS" });
    expect(entry.lines).toEqual([
      { accountId: "QRIS", debit: 65_500, credit: 0 },
      { accountId: "AR", debit: 0, credit: 65_000 },
      { accountId: "OI", debit: 0, credit: 500 },
    ]);
  });

  it("expense and balance adjustments balance", () => {
    expect(balanced(postExpense("EXP", "CASH", 25_000, "x").lines)).toBe(true);
    expect(postBalanceAdjustment("CASH", "EQ", -3_000, "selisih").lines).toEqual([
      { accountId: "EQ", debit: 3_000, credit: 0 },
      { accountId: "CASH", debit: 0, credit: 3_000 },
    ]);
  });

  it("finalize rejects an unbalanced or fractional entry", () => {
    expect(() => finalize({ description: "x", lines: [{ accountId: "A", debit: 10, credit: 0 }] })).toThrow(UnbalancedEntryError);
    expect(() => finalize({ description: "x", lines: [{ accountId: "A", debit: 1.5, credit: 0 }, { accountId: "B", debit: 0, credit: 1.5 }] })).toThrow(
      UnbalancedEntryError,
    );
  });
});

describe("profitFromKinds", () => {
  it("untung bersih = penjualan bersih − HPP − komisi − beban + pendapatan lain", () => {
    const pnl = profitFromKinds([
      { kind: "revenue", debit: 0, credit: 500_000 },
      { kind: "contra_revenue", debit: 50_000, credit: 0 },
      { kind: "cogs", debit: 200_000, credit: 0 },
      { kind: "commission", debit: 10_000, credit: 0 },
      { kind: "expense", debit: 60_000, credit: 5_000 },
      { kind: "other_income", debit: 0, credit: 1_000 },
      { kind: "wallet", debit: 999, credit: 0 },
    ]);
    expect(pnl).toMatchObject({ sales: 500_000, discounts: 50_000, netSales: 450_000, costOfGoods: 200_000, channelCommission: 10_000, expenses: 55_000, otherIncome: 1_000, netProfit: 186_000 });
  });
});
