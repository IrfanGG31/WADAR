import { describe, expect, it } from "vitest";
import { balanceSheet, profitAndLoss, shelfStock, stockReconciliation, type AccountBalanceRow } from "./ledger";

const row = (account_code: string, name: string, type: AccountBalanceRow["type"], p: [number, number], c: [number, number]): AccountBalanceRow => ({
  account_code,
  name,
  type,
  period_debit: p[0],
  period_credit: p[1],
  closing_debit: c[0],
  closing_credit: c[1],
});

// The journal test shop (supabase/tests/26_journal.sql) after posting.
const ROWS: AccountBalanceRow[] = [
  row("1-1000", "Kas & bank", "asset", [200_000 + 10_000, 885_000], [210_000, 885_000]),
  row("1-1300", "Persediaan barang", "asset", [1_430_000, 270_000], [1_430_000, 270_000]),
  row("2-1000", "Utang ke pemasok", "liability", [300_000, 440_000], [300_000, 440_000]),
  row("3-1000", "Modal pemilik", "equity", [0, 400_000], [0, 400_000]),
  row("4-1000", "Penjualan", "revenue", [200_000, 400_000], [200_000, 400_000]),
  row("5-1000", "Harga pokok penjualan (HPP)", "expense", [180_000, 90_000], [180_000, 90_000]),
  row("6-2000", "Selisih & susut stok", "expense", [90_000, 0], [90_000, 0]),
  row("6-9000", "Beban operasional", "expense", [85_000, 10_000], [85_000, 10_000]),
];

describe("ledger statements", () => {
  it("profit and loss: revenue minus every expense account", () => {
    const pl = profitAndLoss(ROWS);
    expect(pl.totalRevenue).toBe(200_000);
    expect(pl.expenses.map((e) => [e.code, e.amount])).toEqual([
      ["5-1000", 90_000],
      ["6-2000", 90_000],
      ["6-9000", 75_000],
    ]);
    expect(pl.netProfit).toBe(-55_000);
  });

  it("balance sheet: assets = liabilities + equity + profit so far", () => {
    const bs = balanceSheet(ROWS);
    expect(bs.assets.map((a) => a.amount)).toEqual([-675_000, 1_160_000]);
    expect(bs.liabilities[0]?.amount).toBe(140_000);
    expect(bs.equity[0]?.amount).toBe(400_000);
    expect(bs.retainedProfit).toBe(-55_000);
    expect(bs.totalAssets).toBe(485_000);
    expect(bs.totalLiabilitiesAndEquity).toBe(485_000);
    expect(bs.balanced).toBe(true);
    expect(balanceSheet([...ROWS.slice(1), row("1-1000", "Kas & bank", "asset", [0, 0], [1, 0])]).balanced).toBe(false);
  });

  it("stock value may drift by the rounding of the average cost, not more", () => {
    expect(stockReconciliation(1_160_000, 1_159_990, 26)).toEqual({ difference: 10, withinRounding: true });
    expect(stockReconciliation(1_160_000, 1_100_000, 26).withinRounding).toBe(false);
  });

  it("values the shelf as on hand × average cost", () => {
    expect(shelfStock([{ on_hand: 26, avg_cost: 44_615 }, { on_hand: -1, avg_cost: 10_000 }])).toEqual({ value: 1_149_990, units: 27 });
  });
});
