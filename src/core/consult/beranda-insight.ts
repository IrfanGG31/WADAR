/**
 * "Insight untukmu" on Beranda (PRD CON-5): made once per shop per shop-local day
 * (TECH-SPEC §6.4 cache table: key = tenant + tanggal, TTL 1 hari), not on every page
 * open. The cache is read BEFORE the shop's data is loaded; the items are template
 * narration of this week's top insights (no LLM), or the stock / finance one-liners
 * when nothing qualifies.
 */
import { safeGet, safeSet, type AnswerStore } from "../answer-cache";
import { narrateProfitHeadline, profitInsight } from "../finance-insight";
import { weekOverWeek } from "../period";
import { narrateStockOverview, needsRestock, sortByUrgency } from "../stock-insight";
import { DAILY_INSIGHT_TTL_MS } from "./cache";
import type { InsightCandidate } from "./insights";
import type { ConsultData } from "./tools";

export interface BerandaInsightItem {
  key: string;
  /** An insight type, or "stok" / "keuangan" for the fallback lines (the page picks icon + link). */
  type: string;
  title: string;
  text: string;
}

export interface BerandaInsight {
  /** Shop-local day the items were made for, "YYYY-MM-DD". */
  day: string;
  items: BerandaInsightItem[];
}

export function berandaInsightKey(tenantId: string, day: string): string {
  return `beranda-insight|v1|${tenantId}|${day}`;
}

export function buildBerandaInsight(p: {
  today: string;
  selected: readonly InsightCandidate[];
  data: Pick<ConsultData, "stock" | "lines" | "expenses">;
}): BerandaInsight {
  if (p.selected.length > 0) {
    return { day: p.today, items: p.selected.map((c) => ({ key: c.dedupe_key, type: c.type, title: c.title, text: c.text })) };
  }
  const { current, previous } = weekOverWeek(p.today);
  const urgent = sortByUrgency(p.data.stock).find(needsRestock);
  return {
    day: p.today,
    items: [
      { key: "stok", type: "stok", title: "Prediksi Stok", text: urgent ? urgent.narrative : narrateStockOverview(p.data.stock) },
      {
        key: "keuangan",
        type: "keuangan",
        title: "Analisis Keuangan",
        text:
          p.data.lines.length > 0 || p.data.expenses.length > 0
            ? narrateProfitHeadline(profitInsight(p.data.lines, p.data.expenses, current, previous))
            : "Belum ada penjualan 14 hari terakhir.",
      },
    ],
  };
}

/** Read-through: a hit returns without calling `compute`; a broken store only means computing. */
export async function dailyBerandaInsight(
  store: AnswerStore,
  tenantId: string,
  day: string,
  compute: () => Promise<BerandaInsight>,
): Promise<BerandaInsight & { cached: boolean }> {
  const key = berandaInsightKey(tenantId, day);
  const hit = await safeGet<BerandaInsight>(store, key);
  if (hit && hit.day === day && Array.isArray(hit.items)) return { ...hit, cached: true };
  const fresh = await compute();
  await safeSet(store, key, fresh, DAILY_INSIGHT_TTL_MS);
  return { ...fresh, cached: false };
}
