"use server";

import { parseFinancePeriodDays } from "@/core/finance-insight";
import { financeReportCsv, financeReportFileName } from "@/core/finance-report";
import { isoDateInZone, lastClosedDays } from "@/core/period";
import { permissionDenied } from "@/db/access";
import { getFinanceData } from "@/db/finance";
import { getShop } from "@/db/shop";

export type FinanceReportResult = { filename: string; csv: string } | { error: string };

/**
 * Unduh laporan (FIN-7): the selected period (`?periode=7|30`, the closed days up to yesterday
 * in the shop's timezone — what the Keuangan screen shows) as CSV, one row per day + total. Read as the signed-in owner (RLS, tenant filter).
 */
export async function exportFinanceReport(slug: string, periode: string | undefined): Promise<FinanceReportResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "finance");
  if (denied) return { error: denied };
  const window = lastClosedDays(isoDateInZone(new Date(), shop.timezone), parseFinancePeriodDays(periode));
  try {
    const { lines, expenses } = await getFinanceData(shop.id, window);
    return { filename: financeReportFileName(shop.slug, window), csv: financeReportCsv(lines, expenses, window) };
  } catch (e) {
    console.error("finance report export failed", e);
    return { error: "Laporan belum bisa diunduh. Coba lagi sebentar." };
  }
}
