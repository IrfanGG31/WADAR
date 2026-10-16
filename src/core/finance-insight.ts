/**
 * Financial Insight screen helpers (D5): turn `fin_daily` rows + expenses into
 * what the Keuangan tabs show — summary cards, the "kenapa untung berubah"
 * effects, category shares for the donut, channel/product margins, warnings and
 * the per-day table. Pure; every amount comes from src/core/finance.ts
 * (totals, decomposition, warnings) so the screens can't drift from the core.
 */
import {
  decomposeProfitChange,
  aggregateByProduct,
  marginWarnings,
  totalsByChannel,
  totalsByVariant,
  totalsOverLines,
  type FinanceTotals,
  type MarginDropCause,
  type MarginWarning,
  type MarginWarningCode,
  type MarginWarningOptions,
  type ProfitChange,
  type ProfitEffects,
  type SaleItemLine,
} from "./finance";
import { allocateLargestRemainder, formatRupiah, formatSignedRupiah } from "./money";
import { formatCount, formatDecimal, formatPercent } from "./number-format";
import { daysOf, inWindow, type PeriodWindow } from "./period";
import { NO_CATEGORY } from "./stock-insight";

/** One row of the `fin_daily` view (day × variant × channel), rupiah integers. */
export interface FinDailyRow {
  day: string;
  variant_id: string;
  channel_id: string;
  q: number;
  revenue_gross: number;
  line_discount: number;
  order_discount_alloc: number;
  cost: number;
  platform_fee_alloc: number;
  shipping_subsidy_alloc: number;
  cost_is_set: boolean;
}

export interface VariantLabel {
  title: string;
  category: string | null;
}

export interface ExpenseEntry {
  /** "YYYY-MM-DD" (expenses.occurred_at). */
  day: string;
  amount: number;
}

/** A sale line that remembers its day and category — what every Keuangan screen works on. */
export interface FinLine extends SaleItemLine {
  day: string;
  category: string | null;
}

export const OTHER_CATEGORY = "Lainnya";
export const CURRENT_LABEL = "7 hari terakhir";
export const PREVIOUS_LABEL = "7 hari sebelumnya";

/** Period lengths the Keuangan screens can compare (FIN-3); 7 stays the default. */
export const FINANCE_PERIOD_DAYS = [7, 30] as const;
export type FinancePeriodDays = (typeof FINANCE_PERIOD_DAYS)[number];

/** `?periode=30` → 30; anything else (missing, unknown) → 7. */
export function parseFinancePeriodDays(raw: string | string[] | undefined): FinancePeriodDays {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return FINANCE_PERIOD_DAYS.find((d) => String(d) === v) ?? 7;
}

export function periodLabels(days: number): { current: string; previous: string } {
  return { current: `${days} hari terakhir`, previous: `${days} hari sebelumnya` };
}

export interface FinancePeriodOption {
  days: FinancePeriodDays;
  label: string;
  /** Search params for the link; the default (7) keeps the bare URL. */
  query: { periode?: string };
  active: boolean;
}

/** The "7 hari · 30 hari" switch on the Keuangan screens. */
export function financePeriodOptions(active: FinancePeriodDays): FinancePeriodOption[] {
  return FINANCE_PERIOD_DAYS.map((days) => ({
    days,
    label: `${days} hari`,
    query: days === 7 ? {} : { periode: String(days) },
    active: days === active,
  }));
}

export function lineFromFinDaily(
  row: FinDailyRow,
  variants: ReadonlyMap<string, VariantLabel>,
  channels: ReadonlyMap<string, string>,
): FinLine {
  const v = variants.get(row.variant_id);
  return {
    day: row.day,
    category: v?.category ?? null,
    variant_id: row.variant_id,
    product_name: v?.title ?? "Produk",
    channel_id: row.channel_id,
    channel_name: channels.get(row.channel_id) ?? "Kanal",
    qty: row.q,
    // Informational per-unit averages; gross_total / cost_total are the exact amounts the core sums.
    unit_price: row.q > 0 ? Math.round(row.revenue_gross / row.q) : 0,
    unit_cost: row.q > 0 ? Math.round(row.cost / row.q) : 0,
    gross_total: row.revenue_gross,
    cost_total: row.cost,
    line_discount: row.line_discount,
    cost_is_set: row.cost_is_set,
    alloc_order_discount: row.order_discount_alloc,
    alloc_platform_fee: row.platform_fee_alloc,
    alloc_shipping_subsidy: row.shipping_subsidy_alloc,
  };
}

export function linesIn<T extends { day: string }>(rows: readonly T[], window: PeriodWindow): T[] {
  return rows.filter((r) => inWindow(r.day, window));
}

export function expensesIn(expenses: readonly ExpenseEntry[], window: PeriodWindow): number {
  return linesIn(expenses, window).reduce((s, e) => s + e.amount, 0);
}

/* ─── Ringkasan: period totals + cards ─────────────────────────────────────── */

export interface PeriodResult {
  window: PeriodWindow;
  totals: FinanceTotals;
  /** E — Σ expenses in the window. */
  expenses: number;
  /** NP = GP − E. */
  NP: number;
}

export function periodResult(lines: readonly FinLine[], expenses: readonly ExpenseEntry[], window: PeriodWindow): PeriodResult {
  const totals = totalsOverLines(linesIn(lines, window));
  const e = expensesIn(expenses, window);
  return { window, totals, expenses: e, NP: totals.GP - e };
}

export type SummaryKey = "R" | "C" | "F" | "S" | "GP" | "NP";

export const SUMMARY_LABEL: Record<SummaryKey, string> = {
  R: "Penjualan bersih",
  C: "Modal barang (HPP)",
  F: "Komisi & potongan",
  S: "Subsidi ongkir",
  GP: "Untung kotor",
  NP: "Untung bersih",
};

export interface SummaryCard {
  key: SummaryKey;
  label: string;
  value: number;
  previous: number;
  delta: number;
  /** % change vs previous, one decimal; null when the previous value is 0. */
  delta_pct: number | null;
  /** Up is good for R/GP/NP; cost lines move with volume, so they stay neutral. */
  tone: "good" | "bad" | "neutral";
  hint: string;
}

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/** Share of `part` in `whole` as a percentage with one decimal; 0 when whole ≤ 0. */
export function sharePct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Margin honest to FIN-4: over lines with known HPP only; null when none are known. */
export function knownMargin(t: FinanceTotals): number | null {
  return t.cost_known_R > 0 ? t.cost_known_margin_pct : null;
}

export function summaryCards(cur: PeriodResult, prev: PeriodResult): SummaryCard[] {
  const valueOf = (p: PeriodResult, key: SummaryKey) => (key === "NP" ? p.NP : p.totals[key]);
  const margin = knownMargin(cur.totals);
  const hints: Record<SummaryKey, string> = {
    R: `${formatCount(cur.totals.q)} barang terjual`,
    C: cur.totals.cost_known_R < cur.totals.R ? "Sebagian produk belum ada HPP" : "Dari HPP saat terjual",
    F: `${formatPercent(sharePct(cur.totals.F, cur.totals.R))} dari penjualan`,
    S: "Ongkir yang ditanggung toko",
    GP: margin === null ? "Margin belum bisa dihitung" : `Margin ${formatPercent(margin)}`,
    NP: `Setelah pengeluaran ${formatRupiah(cur.expenses)}`,
  };
  return (Object.keys(SUMMARY_LABEL) as SummaryKey[]).map((key) => {
    const value = valueOf(cur, key);
    const previous = valueOf(prev, key);
    const delta = value - previous;
    const upIsGood = key === "R" || key === "GP" || key === "NP";
    return {
      key,
      label: SUMMARY_LABEL[key],
      value,
      previous,
      delta,
      delta_pct: pctChange(value, previous),
      tone: !upIsGood || delta === 0 ? "neutral" : delta > 0 ? "good" : "bad",
      hint: hints[key],
    };
  });
}

/* ─── Kenapa untung berubah (FIN-5) ────────────────────────────────────────── */

export const EFFECT_LABEL: Record<keyof ProfitEffects, string> = {
  volume: "Jumlah terjual",
  price: "Harga jual",
  discount: "Diskon",
  cogs: "Modal barang (HPP)",
  fee: "Komisi kanal",
  shipping: "Subsidi ongkir",
  new_products: "Produk baru",
  stopped_products: "Produk berhenti terjual",
  expense: "Pengeluaran",
};

/** Lower-case phrases for use inside a sentence. */
const EFFECT_PHRASE: Record<keyof ProfitEffects, string> = {
  volume: "jumlah terjual",
  price: "harga jual",
  discount: "diskon",
  cogs: "modal barang",
  fee: "komisi kanal",
  shipping: "subsidi ongkir",
  new_products: "produk baru",
  stopped_products: "produk berhenti terjual",
  expense: "pengeluaran",
};

export interface EffectRow {
  key: keyof ProfitEffects;
  label: string;
  amount: number;
}

/** Non-zero effects, largest |amount| first. */
export function effectRows(change: ProfitChange): EffectRow[] {
  const keys = Object.keys(EFFECT_LABEL) as (keyof ProfitEffects)[];
  return keys
    .map((key) => ({ key, label: EFFECT_LABEL[key], amount: change.effects[key] }))
    .filter((e) => e.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || keys.indexOf(a.key) - keys.indexOf(b.key));
}

export interface Contributor {
  key: string;
  label: string;
  delta_gp: number;
}

/** ΔGP per channel between two periods, largest |Δ| first, zeros dropped. */
export function channelGpChanges(prev: readonly SaleItemLine[], cur: readonly SaleItemLine[]): Contributor[] {
  const before = new Map(totalsByChannel(prev).map((c) => [c.key, c]));
  const after = new Map(totalsByChannel(cur).map((c) => [c.key, c]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .map((key) => ({
      key,
      label: after.get(key)?.label ?? before.get(key)?.label ?? "Kanal",
      delta_gp: (after.get(key)?.totals.GP ?? 0) - (before.get(key)?.totals.GP ?? 0),
    }))
    .filter((c) => c.delta_gp !== 0)
    .sort((a, b) => Math.abs(b.delta_gp) - Math.abs(a.delta_gp) || a.label.localeCompare(b.label, "id"));
}

export interface ProfitInsight {
  change: ProfitChange;
  effects: EffectRow[];
  topProduct: Contributor | null;
  topChannel: Contributor | null;
  narrative: string;
  /** False when the previous window had no sales and no expenses — nothing to compare against. */
  comparable: boolean;
  /** Window length the narration names ("7 hari terakhir" / "30 hari terakhir"). */
  days: number;
}

/**
 * Week-over-week profit change: decomposition (Σ effects = ΔNP), its largest
 * effects, the product and channel that moved untung kotor most, and a
 * template sentence that only quotes those numbers.
 */
export function profitInsight(
  lines: readonly FinLine[],
  expenses: readonly ExpenseEntry[],
  current: PeriodWindow,
  previous: PeriodWindow,
  days = 7,
): ProfitInsight {
  const cur = linesIn(lines, current);
  const prev = linesIn(lines, previous);
  const e0 = expensesIn(expenses, previous);
  const e1 = expensesIn(expenses, current);
  const change = decomposeProfitChange(aggregateByProduct(prev), aggregateByProduct(cur), e0, e1);
  const effects = effectRows(change);
  const p = change.by_product.find((x) => x.delta_gp !== 0);
  const topProduct = p ? { key: p.variant_id, label: p.product_name ?? "Produk", delta_gp: p.delta_gp } : null;
  const topChannel = channelGpChanges(prev, cur)[0] ?? null;
  const comparable = prev.length > 0 || e0 > 0;
  return {
    change,
    effects,
    topProduct,
    topChannel,
    comparable,
    days,
    narrative: comparable
      ? narrateProfitChange(change, effects, topProduct, topChannel, days)
      : `Belum ada data ${periodLabels(days).previous} untuk dibandingkan.`,
  };
}

/** "Untung bersih 7 hari terakhir turun Rp…. Penyebab terbesar: diskon -Rp…, …" — at most 3 effects (§7.2). */
export function narrateProfitChange(
  change: ProfitChange,
  effects: readonly EffectRow[] = effectRows(change),
  topProduct: Contributor | null = null,
  topChannel: Contributor | null = null,
  days = 7,
): string {
  const label = periodLabels(days);
  if (change.delta === 0) return `Untung bersih ${label.current} sama dengan ${label.previous}.`;
  const dir = change.delta > 0 ? "naik" : "turun";
  const sentences = [`Untung bersih ${label.current} ${dir} ${formatRupiah(Math.abs(change.delta))} dibanding ${label.previous}.`];
  const top = effects.slice(0, 3);
  if (top.length > 0) {
    sentences.push(`Penyebab terbesar: ${top.map((e) => `${EFFECT_PHRASE[e.key]} ${formatSignedRupiah(e.amount)}`).join(", ")}.`);
  }
  if (topProduct) sentences.push(`Produk paling berpengaruh: ${topProduct.label} (${formatSignedRupiah(topProduct.delta_gp)}).`);
  if (topChannel) sentences.push(`Kanal paling berpengaruh: ${topChannel.label} (${formatSignedRupiah(topChannel.delta_gp)}).`);
  return sentences.join(" ");
}

/** One-line version for the Beranda "Insight untukmu" card: ΔNP and its single largest effect. */
export function narrateProfitHeadline(insight: ProfitInsight): string {
  if (!insight.comparable) return insight.narrative;
  const { delta } = insight.change;
  const label = periodLabels(insight.days);
  if (delta === 0) return `Untung bersih ${label.current} sama dengan ${label.previous}.`;
  const top = insight.effects[0];
  const cause = top ? `, terutama karena ${EFFECT_PHRASE[top.key]} (${formatSignedRupiah(top.amount)})` : "";
  return `Untung bersih ${label.current} ${delta > 0 ? "naik" : "turun"} ${formatRupiah(Math.abs(delta))}${cause}.`;
}

/* ─── Donut: penjualan per kategori ────────────────────────────────────────── */

export interface CategorySlice {
  key: string;
  label: string;
  R: number;
  /** Tenths of a percent; slices always sum to exactly 1000 (largest remainder). */
  share_permille: number;
  /** Σ share_permille of the slices before this one — where its arc starts on the donut. */
  start_permille: number;
}

/**
 * Penjualan bersih per category, largest first; categories beyond the top
 * `maxSlices` fold into "Lainnya" (a donut stays readable). Shares are split
 * with the largest-remainder method so the legend always adds up to 100%.
 */
export function categoryShares(lines: readonly FinLine[], maxSlices = 5): { total: number; slices: CategorySlice[] } {
  const byCategory = new Map<string, number>();
  for (const l of lines) {
    const key = l.category ?? NO_CATEGORY;
    byCategory.set(key, (byCategory.get(key) ?? 0) + totalsOverLines([l]).R);
  }
  const ranked = [...byCategory.entries()]
    .map(([label, R]) => ({ label, R: Math.max(0, R) }))
    .filter((c) => c.R > 0)
    .sort((a, b) => b.R - a.R || a.label.localeCompare(b.label, "id"));
  const keep = Math.max(1, maxSlices);
  const head = ranked.length > keep ? ranked.slice(0, keep) : ranked;
  const rest = ranked.length > keep ? ranked.slice(keep) : [];
  const groups = rest.length > 0 ? [...head, { label: OTHER_CATEGORY, R: rest.reduce((s, c) => s + c.R, 0) }] : head;
  const total = groups.reduce((s, c) => s + c.R, 0);
  if (total === 0) return { total: 0, slices: [] };
  const shares = allocateLargestRemainder(1000n, groups.map((c) => BigInt(c.R))).map(Number);
  return {
    total,
    slices: groups.map((c, i) => ({
      key: c.label,
      label: c.label,
      R: c.R,
      share_permille: shares[i],
      start_permille: shares.slice(0, i).reduce((s, n) => s + n, 0),
    })),
  };
}

/* ─── Margin per kanal & per produk (FIN-4) ────────────────────────────────── */

export interface ChannelMarginRow {
  key: string;
  label: string;
  q: number;
  R: number;
  F: number;
  /** F / R in %, one decimal. */
  fee_pct: number;
  GP: number;
  margin_pct: number | null;
  /** The channel with the thinnest margin (only flagged when ≥ 2 channels have one). */
  thinnest: boolean;
}

function byMarginAsc<T extends { margin_pct: number | null; R: number }>(a: T, b: T): number {
  if (a.margin_pct === null || b.margin_pct === null) return a.margin_pct === null ? (b.margin_pct === null ? b.R - a.R : 1) : -1;
  return a.margin_pct - b.margin_pct || b.R - a.R;
}

/** Thinnest margin first — the channel eating profit is the first thing the owner sees. */
export function channelMarginRows(lines: readonly SaleItemLine[]): ChannelMarginRow[] {
  const rows = totalsByChannel(lines)
    .map(({ key, label, totals }) => ({
      key,
      label: label ?? "Kanal",
      q: totals.q,
      R: totals.R,
      F: totals.F,
      fee_pct: sharePct(totals.F, totals.R),
      GP: totals.GP,
      margin_pct: knownMargin(totals),
      thinnest: false,
    }))
    .sort(byMarginAsc);
  const withMargin = rows.filter((r) => r.margin_pct !== null);
  if (withMargin.length >= 2) withMargin[0].thinnest = true;
  return rows;
}

export interface ProductMarginRow {
  key: string;
  label: string;
  q: number;
  R: number;
  GP: number;
  margin_pct: number | null;
  /** Some of the sales had no HPP — flagged instead of shown as a 100% margin (FIN-4). */
  missing_cost: boolean;
}

/** Per variant, thinnest margin first; variants without HPP go last. */
export function productMarginRows(lines: readonly SaleItemLine[]): ProductMarginRow[] {
  return totalsByVariant(lines)
    .map(({ key, label, totals }) => ({
      key,
      label: label ?? "Produk",
      q: totals.q,
      R: totals.R,
      GP: totals.GP,
      margin_pct: knownMargin(totals),
      missing_cost: totals.cost_known_R < totals.R,
    }))
    .sort(byMarginAsc);
}

/* ─── Peringatan margin (FIN-6) ────────────────────────────────────────────── */

export const MARGIN_WARNING_LABEL: Record<MarginWarningCode, string> = {
  SELL_BELOW_COST: "Jual di bawah modal",
  FEE_HEAVY: "Komisi kanal tinggi",
  DISCOUNT_HEAVY: "Diskon terlalu besar",
  MARGIN_DROP: "Margin tergerus",
  MISSING_COST: "HPP belum diisi",
};

/** "Sebabnya: …" — the cost line whose share of penjualan kotor grew most. */
const DROP_CAUSE_PHRASE: Record<MarginDropCause, string> = {
  cogs: "modal barang (HPP) makin besar dibanding harga jual",
  fee: "komisi kanal makin besar",
  discount: "diskon makin besar",
  shipping: "subsidi ongkir makin besar",
};

function narrateMarginDrop(w: MarginWarning): string {
  const s = w.stats;
  const { current, previous } = periodLabels(s.days);
  const sentences = [
    `Margin ${current} turun ${formatDecimal(s.drop_pts)} poin, dari ${formatPercent(s.margin_before)} jadi ${formatPercent(s.margin_now)} dibanding ${previous}.`,
  ];
  if (w.cause) {
    sentences.push(
      `Sebabnya: ${DROP_CAUSE_PHRASE[w.cause]}, dari ${formatPercent(s.cause_before)} jadi ${formatPercent(s.cause_now)} penjualan kotor.`,
    );
  }
  // drop_pts poin of every Rp100.000 = drop_pts × Rp1.000.
  sentences.push(
    `Akibatnya, dari setiap ${formatRupiah(100_000)} penjualan, untung kotormu berkurang ±${formatRupiah(Math.round(s.drop_pts * 1_000))} (±${formatRupiah(s.lost_gp)} di periode ini).`,
  );
  return sentences.join(" ");
}

/** Indonesian sentence for one warning, quoting only the warning's own stats. */
export function narrateMarginWarning(w: MarginWarning): string {
  const s = w.stats;
  switch (w.code) {
    case "SELL_BELOW_COST":
      return `${w.label ?? "Produk"}: ${formatCount(s.qty)} unit terjual di bawah modal, rugi ${formatRupiah(s.loss)}.`;
    case "FEE_HEAVY":
      return `Komisi ${w.label ?? "kanal"} ${formatPercent(sharePct(s.F, s.R))} dari penjualan (${formatRupiah(s.F)} dari ${formatRupiah(s.R)}), di atas batas 20%.`;
    case "DISCOUNT_HEAVY":
      return `Diskon ${formatPercent(sharePct(s.discount, s.revenue_gross))} dari penjualan kotor (${formatRupiah(s.discount)} dari ${formatRupiah(s.revenue_gross)}), di atas batas 15%.`;
    case "MARGIN_DROP":
      return narrateMarginDrop(w);
    case "MISSING_COST":
      return `${w.label ?? "Produk"} terjual ${formatRupiah(s.R_missing)} tanpa HPP (modal). Akibatnya margin dan untung terlihat lebih besar dari aslinya. Isi HPP-nya di Stok supaya angkanya akurat.`;
  }
}

export interface WarningRow {
  code: MarginWarningCode;
  key: string;
  title: string;
  detail: string;
  severity: 1 | 2 | 3;
  /** Where "Lihat datanya" points on the Margin tab. */
  anchor: "produk" | "kanal" | null;
}

/** Codes whose "Lihat datanya" points at the per-product margin table even though they cover the whole period. */
const PRODUCT_ANCHORED: readonly MarginWarningCode[] = ["MARGIN_DROP", "MISSING_COST"];

/** Pass `opts.previous` (same-length window before) to also check MARGIN_DROP. */
export function warningRows(lines: readonly SaleItemLine[], opts: MarginWarningOptions = {}): WarningRow[] {
  return marginWarnings(lines, opts).map((w) => ({
    code: w.code,
    key: `${w.code}:${w.key ?? "period"}`,
    title: MARGIN_WARNING_LABEL[w.code],
    detail: narrateMarginWarning(w),
    severity: w.severity,
    anchor: w.scope === "variant" || PRODUCT_ANCHORED.includes(w.code) ? "produk" : w.scope === "channel" ? "kanal" : null,
  }));
}

/* ─── Detail: tabel per hari ───────────────────────────────────────────────── */

export interface DailyFinanceRow {
  day: string;
  q: number;
  R: number;
  C: number;
  F: number;
  S: number;
  GP: number;
  E: number;
  NP: number;
}

/** One row per day of the window (oldest first), zero-filled, each from {@link totalsOverLines}. */
export function dailyFinanceRows(
  lines: readonly FinLine[],
  expenses: readonly ExpenseEntry[],
  window: PeriodWindow,
): DailyFinanceRow[] {
  const linesByDay = new Map<string, FinLine[]>();
  for (const l of linesIn(lines, window)) {
    const list = linesByDay.get(l.day) ?? [];
    list.push(l);
    linesByDay.set(l.day, list);
  }
  return daysOf(window).map((day) => {
    const t = totalsOverLines(linesByDay.get(day) ?? []);
    const E = expensesIn(expenses, { from: day, to: day });
    return { day, q: t.q, R: t.R, C: t.C, F: t.F, S: t.S, GP: t.GP, E, NP: t.GP - E };
  });
}

export function sumDailyRows(rows: readonly DailyFinanceRow[]): Omit<DailyFinanceRow, "day"> {
  const acc = { q: 0, R: 0, C: 0, F: 0, S: 0, GP: 0, E: 0, NP: 0 };
  for (const r of rows) {
    acc.q += r.q;
    acc.R += r.R;
    acc.C += r.C;
    acc.F += r.F;
    acc.S += r.S;
    acc.GP += r.GP;
    acc.E += r.E;
    acc.NP += r.NP;
  }
  return acc;
}
