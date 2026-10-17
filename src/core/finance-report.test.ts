import { describe, expect, it } from "vitest";
import { lineFromFinDaily, type ExpenseEntry, type FinDailyRow, type FinLine } from "./finance-insight";
import { financeReportCsv, financeReportFileName } from "./finance-report";

const line = (day: string, over: Partial<FinDailyRow> = {}): FinLine =>
  lineFromFinDaily(
    {
      day,
      variant_id: "v1",
      channel_id: "pos",
      q: over.q ?? 2,
      revenue_gross: (over.q ?? 2) * 20000,
      line_discount: 0,
      order_discount_alloc: 0,
      cost: (over.q ?? 2) * 8000,
      platform_fee_alloc: 0,
      shipping_subsidy_alloc: 0,
      cost_is_set: true,
      ...over,
    },
    new Map([["v1", { title: "Kopi Susu", category: null }]]),
    new Map([["pos", "Kasir"]]),
  );

const WINDOW = { from: "2026-10-15", to: "2026-10-17" };
const LINES = [
  line("2026-10-14", { q: 9 }), // before the window: not in the report
  line("2026-10-15"),
  line("2026-10-17", { q: 1, platform_fee_alloc: 2000 }),
];
const EXPENSES: ExpenseEntry[] = [{ day: "2026-10-16", amount: 5000 }];

describe("financeReportCsv (FIN-7)", () => {
  it("one row per day of the chosen period (oldest first) plus a total row, whole rupiah", () => {
    const csv = financeReportCsv(LINES, EXPENSES, WINDOW);
    expect(csv.split("\r\n")).toEqual([
      "﻿tanggal,qty,penjualan_bersih,modal_hpp,komisi_potongan,subsidi_ongkir,untung_kotor,pengeluaran,untung_bersih",
      "2026-10-15,2,40000,16000,0,0,24000,0,24000",
      "2026-10-16,0,0,0,0,0,0,5000,-5000",
      "2026-10-17,1,20000,8000,2000,0,10000,0,10000",
      "TOTAL,3,60000,24000,2000,0,34000,5000,29000",
      "",
    ]);
  });

  it("an empty period still gives the header, every day at zero and the total", () => {
    const rows = financeReportCsv([], [], WINDOW).split("\r\n");
    expect(rows).toHaveLength(6);
    expect(rows[4]).toBe("TOTAL,0,0,0,0,0,0,0,0");
  });
});

describe("financeReportFileName", () => {
  it("names the shop and the period", () => {
    expect(financeReportFileName("kopi-dimas", WINDOW)).toBe("wadar-kopi-dimas-keuangan-20261015-20261017.csv");
  });
});
