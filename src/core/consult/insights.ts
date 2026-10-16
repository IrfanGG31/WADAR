/**
 * Insight mingguan (CON-3, TECH-SPEC §7.4): deterministic candidates, score =
 * dampak Rp × urgensi, dedupe 7 hari, top-3, then a template narration
 * (3 poin + 1 kalimat). The LLM `narrate` task may rewrite the narration but
 * is held to the same grounding check as every consult answer.
 */
import { marginWarnings } from "../finance";
import { linesIn, MARGIN_WARNING_LABEL, narrateMarginWarning } from "../finance-insight";
import { formatRupiah } from "../money";
import { formatPercent } from "../number-format";
import { addDays } from "../period";
import { sortByUrgency } from "../stock-insight";
import {
  explainProfitChange,
  getCustomerStats,
  resolvePeriod,
  type ConsultData,
  type InsightRecord,
} from "./tools";

/** Urgency weights: kritis 3, peringatan 2, info 1. */
export type Urgency = 1 | 2 | 3;
export const URGENCY_LABEL: Record<Urgency, string> = { 3: "Kritis", 2: "Peringatan", 1: "Info" };

export const SLOW_CAPITAL_MIN = 500_000;
export const LAPSED_CUSTOMER_DAYS = 30;
export const STOCK_TOP_N = 20;
export const DEDUPE_DAYS = 7;
export const WEEKLY_LIMIT = 3;

export interface InsightCandidate {
  type: "stock_critical" | "slow_mover" | "margin_warning" | "profit_effect" | "lapsed_customers";
  urgency: Urgency;
  /** Estimated rupiah at stake. */
  impact: number;
  /** impact × urgency. */
  score: number;
  title: string;
  /** One sentence, numbers straight from the tool results. */
  text: string;
  dedupe_key: string;
  evidence: Record<string, unknown>;
}

export function scoreOf(impact: number, urgency: Urgency): number {
  return Math.max(0, impact) * urgency;
}

function candidate(c: Omit<InsightCandidate, "score">): InsightCandidate {
  return { ...c, score: scoreOf(c.impact, c.urgency) };
}

/** Every insight the week's data supports, unsorted. */
export function weeklyCandidates(d: ConsultData): InsightCandidate[] {
  const out: InsightCandidate[] = [];
  const week = resolvePeriod("7d", d.today);
  const weekLines = linesIn(d.lines, week.window);
  const revenueByVariant = new Map<string, number>();
  for (const l of weekLines) {
    const gross = l.gross_total ?? l.qty * l.unit_price;
    revenueByVariant.set(l.variant_id, (revenueByVariant.get(l.variant_id) ?? 0) + gross - l.line_discount - l.alloc_order_discount);
  }

  // 1. Stok kritis — top-20 by urgency; impact = what the product sold in the last 7 days (what a stock-out would cost).
  for (const r of sortByUrgency(d.stock).slice(0, STOCK_TOP_N)) {
    if (r.status !== "habis" && r.status !== "kritis") continue;
    const impact = revenueByVariant.get(r.variant_id) ?? 0;
    const when = r.status === "habis" ? "sudah habis" : r.stockout_in_days === null ? "hampir habis" : `habis ±${r.stockout_in_days} hari lagi`;
    out.push(
      candidate({
        type: "stock_critical",
        urgency: 3,
        impact,
        title: `Stok ${r.title} ${r.status}`,
        text: `${r.title} ${when} (stok ${r.on_hand} ${r.unit}); pesan ${r.reorder_qty} ${r.unit}. Penjualannya 7 hari terakhir ${formatRupiah(impact)}.`,
        dedupe_key: `stock_critical:${r.variant_id}`,
        evidence: { variant: r.title, on_hand: r.on_hand, reorder_qty: r.reorder_qty, stockout_in_days: r.stockout_in_days, R_7d: impact },
      }),
    );
  }

  // 2. Lambat laku dengan modal tertahan ≥ Rp500 rb.
  for (const r of d.stock) {
    if (!r.slow_moving || r.idle_capital < SLOW_CAPITAL_MIN) continue;
    out.push(
      candidate({
        type: "slow_mover",
        urgency: 2,
        impact: r.idle_capital,
        title: `${r.title} lambat laku`,
        text: `${r.title} lambat laku dan menahan modal ${formatRupiah(r.idle_capital)} (${r.on_hand} ${r.unit}). Pertimbangkan promo atau berhenti memesan.`,
        dedupe_key: `slow_mover:${r.variant_id}`,
        evidence: { variant: r.title, idle_capital: r.idle_capital, on_hand: r.on_hand },
      }),
    );
  }

  // 3. Peringatan margin (7 hari, margin tergerus dibanding 7 hari sebelumnya).
  for (const w of marginWarnings(weekLines, { previous: linesIn(d.lines, week.previous), days: 7 })) {
    const s = w.stats;
    let impact: number;
    let title: string;
    let text: string;
    switch (w.code) {
      case "SELL_BELOW_COST":
        impact = s.loss;
        title = "Jual di bawah modal";
        text = `${w.label ?? "Produk"} terjual di bawah modal ${s.qty} unit, rugi ${formatRupiah(s.loss)}.`;
        break;
      case "FEE_HEAVY":
        impact = s.F;
        title = "Komisi kanal berat";
        text = `Komisi ${w.label ?? "kanal"} ${formatRupiah(s.F)} atau ${formatPercent((s.F / s.R) * 100)} dari penjualannya, di atas batas 20%.`;
        break;
      case "DISCOUNT_HEAVY":
        impact = s.discount;
        title = "Diskon terlalu besar";
        text = `Diskon ${formatRupiah(s.discount)} atau ${formatPercent((s.discount / s.revenue_gross) * 100)} dari penjualan kotor, di atas batas 15%.`;
        break;
      case "MARGIN_DROP":
        impact = s.lost_gp;
        title = MARGIN_WARNING_LABEL[w.code];
        text = narrateMarginWarning(w);
        break;
      case "MISSING_COST":
        // Data hygiene: no rupiah at stake by itself, so it only fills a free slot.
        impact = 0;
        title = MARGIN_WARNING_LABEL[w.code];
        text = narrateMarginWarning(w);
        break;
    }
    out.push(
      candidate({
        type: "margin_warning",
        urgency: w.severity,
        impact,
        title,
        text,
        dedupe_key: `margin_warning:${w.code}:${w.key ?? "period"}`,
        evidence: { code: w.code, label: w.label ?? null, ...s },
      }),
    );
  }

  // 4. 1–2 efek terbesar perubahan untung (minggu ini vs minggu lalu).
  const change = explainProfitChange(d, { period_a: { from: addDays(week.window.from, -7), to: addDays(week.window.from, -1) }, period_b: "7d" });
  if (change.comparable) {
    for (const e of change.effects.slice(0, 2)) {
      out.push(
        candidate({
          type: "profit_effect",
          urgency: e.amount < 0 ? 2 : 1,
          impact: Math.abs(e.amount),
          title: `${e.label} ${e.amount < 0 ? "menekan" : "menambah"} untung`,
          text: `${e.label} ${e.amount < 0 ? "mengurangi" : "menambah"} untung bersih ${formatRupiah(Math.abs(e.amount))} dibanding minggu lalu (untung bersih ${change.delta < 0 ? "turun" : "naik"} ${formatRupiah(Math.abs(change.delta))} total).`,
          dedupe_key: `profit_effect:${e.label}:${e.amount < 0 ? "neg" : "pos"}`,
          evidence: { effect: e.label, amount: e.amount, delta: change.delta, np_before: change.np_before, np_after: change.np_after },
        }),
      );
    }
  }

  // 5. Pelanggan top yang belum beli > 30 hari.
  const cs = getCustomerStats(d, { period: "30d", idle_days: LAPSED_CUSTOMER_DAYS });
  if (cs.lapsed_top_customers.length > 0) {
    const impact = cs.lapsed_top_customers.reduce((s, c) => s + Math.round(c.total_spent / Math.max(1, c.orders_count)), 0);
    const names = cs.lapsed_top_customers.slice(0, 3).map((c) => c.name).join(", ");
    out.push(
      candidate({
        type: "lapsed_customers",
        urgency: 1,
        impact,
        title: "Pelanggan top belum beli lagi",
        text: `${cs.lapsed_top_customers.length} pelanggan top belum beli > ${LAPSED_CUSTOMER_DAYS} hari (${names}); satu kali belanja mereka ±${formatRupiah(impact)}. Coba kirim pesan.`,
        dedupe_key: "lapsed_customers",
        evidence: { count: cs.lapsed_top_customers.length, impact, customers: cs.lapsed_top_customers },
      }),
    );
  }
  return out;
}

/** Keys of insights created in the last {@link DEDUPE_DAYS} days (excluding the batch being regenerated). */
export function recentKeys(insights: readonly InsightRecord[], today: string, exceptPeriodStart: string | null = null): Set<string> {
  const from = addDays(today, -(DEDUPE_DAYS - 1));
  return new Set(
    insights.filter((i) => i.created_day >= from && (exceptPeriodStart === null || i.period_start !== exceptPeriodStart)).map((i) => i.dedupe_key),
  );
}

/** Highest score first (then urgency, then key — stable); drop what was shown in the last 7 days; top-N. */
export function selectInsights(cands: readonly InsightCandidate[], seen: ReadonlySet<string>, limit = WEEKLY_LIMIT): InsightCandidate[] {
  const best = new Map<string, InsightCandidate>();
  for (const c of cands) {
    if (seen.has(c.dedupe_key)) continue;
    const prev = best.get(c.dedupe_key);
    if (!prev || c.score > prev.score) best.set(c.dedupe_key, c);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || b.urgency - a.urgency || a.dedupe_key.localeCompare(b.dedupe_key))
    .slice(0, limit);
}

export interface InsightNarration {
  points: string[];
  summary: string;
}

/** Template narration: one point per insight and one summary sentence — quotes only the candidates' own numbers. */
export function narrateInsights(selected: readonly InsightCandidate[]): InsightNarration {
  if (selected.length === 0) {
    return { points: [], summary: "Minggu ini belum ada hal baru yang perlu perhatianmu. Tokomu aman." };
  }
  const total = selected.reduce((s, c) => s + c.impact, 0);
  const top = selected[0];
  return {
    points: selected.map((c) => `${c.title}: ${c.text}`),
    summary: `Ada ${selected.length} hal yang perlu perhatianmu minggu ini dengan total dampak ±${formatRupiah(total)}; yang paling mendesak: ${top.title.toLowerCase()}.`,
  };
}

export function narrationText(n: InsightNarration): string {
  return n.points.length === 0 ? n.summary : `${n.summary}\n${n.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
}

/** Monday of the week containing `day` ("YYYY-MM-DD") — the `period_start` of a weekly batch. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}
