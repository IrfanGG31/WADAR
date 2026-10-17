/**
 * Ekspor laporan keuangan (FIN-7): the Detail table of a chosen period as one CSV —
 * a row per day (oldest first) plus a TOTAL row. Every number comes from
 * dailyFinanceRows / sumDailyRows (whole rupiah); this module only formats.
 */
import { brand } from "@/brand";
import { toCsv } from "./export";
import { dailyFinanceRows, sumDailyRows, type ExpenseEntry, type FinLine } from "./finance-insight";
import type { PeriodWindow } from "./period";

const HEADERS = [
  "tanggal",
  "qty",
  "penjualan_bersih",
  "modal_hpp",
  "komisi_potongan",
  "subsidi_ongkir",
  "untung_kotor",
  "pengeluaran",
  "untung_bersih",
] as const;

/** UTF-8 BOM so spreadsheet apps open the file as UTF-8. */
const BOM = "﻿";

export function financeReportCsv(lines: readonly FinLine[], expenses: readonly ExpenseEntry[], window: PeriodWindow): string {
  const rows = dailyFinanceRows(lines, expenses, window);
  const t = sumDailyRows(rows);
  return (
    BOM +
    toCsv(HEADERS, [
      ...rows.map((r) => [r.day, r.q, r.R, r.C, r.F, r.S, r.GP, r.E, r.NP]),
      ["TOTAL", t.q, t.R, t.C, t.F, t.S, t.GP, t.E, t.NP],
    ])
  );
}

/** `<brand>-<slug>-keuangan-YYYYMMDD-YYYYMMDD.csv` (the period's first and last day). */
export function financeReportFileName(slug: string, window: PeriodWindow): string {
  const d = (iso: string) => iso.replaceAll("-", "");
  return `${brand.shortName.toLowerCase()}-${slug}-keuangan-${d(window.from)}-${d(window.to)}.csv`;
}
