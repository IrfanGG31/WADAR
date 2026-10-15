/**
 * Konsultasi tools (TECH-SPEC §7.4): read-only functions over one loaded
 * `ConsultData`. Every figure is computed here from src/core/finance*.ts and
 * stock*.ts — the model only picks a tool and narrates the result, and each
 * result already carries the delta and percent so it never has to subtract.
 * Keys ending in `_pct` are percentages (the grounding check reads them so).
 */
import { marginWarnings, totalsByChannel, totalsByVariant, totalsOverLines, type FinanceTotals } from "../finance";
import {
  effectRows,
  expensesIn,
  knownMargin,
  linesIn,
  narrateMarginWarning,
  profitInsight,
  type ExpenseEntry,
  type FinLine,
} from "../finance-insight";
import { formatRupiah } from "../money";
import { formatPercent } from "../number-format";
import { addDays, lastDays, type PeriodWindow } from "../period";
import {
  DEFAULT_FORECAST_FILTER,
  filterForecastRows,
  needsRestock,
  NO_CATEGORY,
  slowMovingSummary,
  sortByUrgency,
  type ForecastRow,
  type StatusFilter,
} from "../stock-insight";

/* ─── Input ────────────────────────────────────────────────────────────────── */

export interface CustomerRow {
  id: string;
  name: string | null;
  total_spent: number;
  orders_count: number;
  /** Shop-local "YYYY-MM-DD" of the first record / last order. */
  first_day: string;
  last_order_day: string | null;
}

export interface MemoryItem {
  id: string;
  kind: "preference" | "fact" | "decision";
  content: string;
  pinned: boolean;
}

export type InsightStatus = "new" | "seen" | "acted" | "dismissed";

export interface InsightRecord {
  type: string;
  title: string;
  body: string;
  severity: number;
  dedupe_key: string;
  status: InsightStatus;
  /** Shop-local day it was created. */
  created_day: string;
  period_start: string | null;
}

export interface ConsultData {
  /** The shop's local today, "YYYY-MM-DD". */
  today: string;
  lines: FinLine[];
  expenses: ExpenseEntry[];
  stock: ForecastRow[];
  customers: CustomerRow[];
  insights: InsightRecord[];
  memory: MemoryItem[];
  /** Conversations waiting on a human (status "escalated"). */
  escalatedChats: number;
}

/* ─── Periods ──────────────────────────────────────────────────────────────── */

export const PERIOD_NAMES = ["today", "yesterday", "7d", "30d", "this_month", "last_month"] as const;
export type PeriodName = (typeof PERIOD_NAMES)[number];
export type PeriodArg = PeriodName | PeriodWindow;

export const PERIOD_LABEL: Record<PeriodName, string> = {
  today: "hari ini",
  yesterday: "kemarin",
  "7d": "7 hari terakhir",
  "30d": "30 hari terakhir",
  this_month: "bulan ini",
  last_month: "bulan lalu",
};

function daysInclusive(w: PeriodWindow): number {
  return Math.round((Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${w.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** The window and the same-length window right before it (what every Δ compares against). */
export function resolvePeriod(period: PeriodArg, today: string): { window: PeriodWindow; previous: PeriodWindow; label: string } {
  let window: PeriodWindow;
  let label: string;
  if (typeof period === "object") {
    window = { from: period.from, to: period.to };
    label = `${period.from} s/d ${period.to}`;
  } else {
    label = PERIOD_LABEL[period];
    const monthStart = `${today.slice(0, 7)}-01`;
    switch (period) {
      case "today":
        window = { from: today, to: today };
        break;
      case "yesterday":
        window = { from: addDays(today, -1), to: addDays(today, -1) };
        break;
      case "7d":
        window = lastDays(today, 7);
        break;
      case "30d":
        window = lastDays(today, 30);
        break;
      case "this_month":
        window = { from: monthStart, to: today };
        break;
      case "last_month": {
        const lastDay = addDays(monthStart, -1);
        window = { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
        break;
      }
    }
  }
  const len = daysInclusive(window);
  return { window, previous: lastDays(addDays(window.from, -1), len), label };
}

/* ─── Comparisons ──────────────────────────────────────────────────────────── */

/** One-decimal percent change; null when there is no previous value to compare. */
export function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) * 1000) / Math.abs(prev)) / 10;
}

export interface Compared {
  value: number;
  prev: number;
  delta: number;
  delta_pct: number | null;
}

function compare(cur: number, prev: number): Compared {
  return { value: cur, prev, delta: cur - prev, delta_pct: deltaPct(cur, prev) };
}

const MAX_ROWS = 10;

/* ─── Tool results ─────────────────────────────────────────────────────────── */

export function netProfit(lines: readonly FinLine[], expenses: readonly ExpenseEntry[], w: PeriodWindow) {
  const t = totalsOverLines(linesIn(lines, w));
  const e = expensesIn(expenses, w);
  return { totals: t, expenses: e, NP: t.GP - e };
}

function totalsRow(t: FinanceTotals) {
  return { q: t.q, R: t.R, C: t.C, F: t.F, S: t.S, GP: t.GP, margin_pct: knownMargin(t) };
}

export function getBusinessSnapshot(d: ConsultData) {
  const today = netProfit(d.lines, d.expenses, { from: d.today, to: d.today });
  const { window, previous } = resolvePeriod("7d", d.today);
  const cur = netProfit(d.lines, d.expenses, window);
  const prev = netProfit(d.lines, d.expenses, previous);
  const warnings = marginWarnings(linesIn(d.lines, window)).slice(0, 3);
  return {
    today: d.today,
    sales_today: { R: today.totals.R, q: today.totals.q, GP: today.totals.GP },
    last_7_days: {
      R: compare(cur.totals.R, prev.totals.R),
      GP: compare(cur.totals.GP, prev.totals.GP),
      NP: compare(cur.NP, prev.NP),
      expenses: cur.expenses,
    },
    critical_stock: sortByUrgency(d.stock.filter(needsRestock))
      .slice(0, 5)
      .map((r) => ({
        title: r.title,
        status: r.status,
        on_hand: r.on_hand,
        unit: r.unit,
        stockout_in_days: r.stockout_in_days,
        reorder_qty: r.reorder_qty,
      })),
    margin_warnings: warnings.map((w) => ({ code: w.code, label: w.label ?? "", message: narrateMarginWarning(w) })),
    open_escalated_chats: d.escalatedChats,
  };
}

export type SalesGroupBy = "day" | "product" | "channel" | "category";

function groupKey(l: FinLine, by: SalesGroupBy): { key: string; label: string } {
  switch (by) {
    case "day":
      return { key: l.day, label: l.day };
    case "product":
      return { key: l.variant_id, label: l.product_name ?? "Produk" };
    case "channel":
      return { key: l.channel_id, label: l.channel_name ?? "Kanal" };
    case "category":
      return { key: l.category ?? NO_CATEGORY, label: l.category ?? NO_CATEGORY };
  }
}

export function getSalesSummary(d: ConsultData, args: { period?: PeriodArg; group_by?: SalesGroupBy } = {}) {
  const by = args.group_by ?? "product";
  const { window, previous, label } = resolvePeriod(args.period ?? "7d", d.today);
  const bucket = (w: PeriodWindow) => {
    const m = new Map<string, { label: string; lines: FinLine[] }>();
    for (const l of linesIn(d.lines, w)) {
      const g = groupKey(l, by);
      const b = m.get(g.key) ?? { label: g.label, lines: [] };
      b.lines.push(l);
      m.set(g.key, b);
    }
    return m;
  };
  const cur = bucket(window);
  const prev = bucket(previous);
  const rows = [...cur.entries()]
    .map(([key, b]) => {
      const t = totalsOverLines(b.lines);
      const p = prev.get(key) ? totalsOverLines(prev.get(key)!.lines) : null;
      return {
        label: b.label,
        q: t.q,
        R: t.R,
        R_prev: p?.R ?? 0,
        R_delta: t.R - (p?.R ?? 0),
        R_delta_pct: deltaPct(t.R, p?.R ?? 0),
      };
    })
    .sort((a, b) => b.R - a.R || a.label.localeCompare(b.label, "id"));
  const total = compare(totalsOverLines(linesIn(d.lines, window)).R, totalsOverLines(linesIn(d.lines, previous)).R);
  return {
    period: label,
    window,
    group_by: by,
    total: { R: total.value, R_prev: total.prev, R_delta: total.delta, R_delta_pct: total.delta_pct },
    rows: rows.slice(0, MAX_ROWS),
    rows_total: rows.length,
  };
}

export function getProfitBreakdown(d: ConsultData, args: { period?: PeriodArg; by?: "product" | "channel" } = {}) {
  const by = args.by ?? "product";
  const { window, previous, label } = resolvePeriod(args.period ?? "7d", d.today);
  const lines = linesIn(d.lines, window);
  const groups = by === "channel" ? totalsByChannel(lines) : totalsByVariant(lines);
  const rows = groups
    .map((g) => ({ label: g.label ?? "-", ...totalsRow(g.totals) }))
    .sort((a, b) => b.GP - a.GP || a.label.localeCompare(b.label, "id"));
  const cur = netProfit(d.lines, d.expenses, window);
  const prev = netProfit(d.lines, d.expenses, previous);
  return {
    period: label,
    window,
    by,
    totals: { ...totalsRow(cur.totals), expenses: cur.expenses, NP: cur.NP },
    previous: { R: prev.totals.R, GP: prev.totals.GP, NP: prev.NP },
    change: {
      GP_delta: cur.totals.GP - prev.totals.GP,
      GP_delta_pct: deltaPct(cur.totals.GP, prev.totals.GP),
      NP_delta: cur.NP - prev.NP,
      NP_delta_pct: deltaPct(cur.NP, prev.NP),
    },
    rows: rows.slice(0, MAX_ROWS),
    rows_total: rows.length,
    thinnest: [...rows].filter((r) => r.margin_pct !== null).sort((a, b) => a.margin_pct! - b.margin_pct!)[0]?.label ?? null,
  };
}

/** `period_a` is the earlier period, `period_b` the later one (what changed from a to b). */
export function explainProfitChange(d: ConsultData, args: { period_a?: PeriodArg; period_b?: PeriodArg } = {}) {
  const b = resolvePeriod(args.period_b ?? "7d", d.today);
  const a = args.period_a ? resolvePeriod(args.period_a, d.today) : { window: b.previous, previous: b.previous, label: "periode sebelumnya" };
  const insight = profitInsight(d.lines, d.expenses, b.window, a.window);
  const { change } = insight;
  return {
    period_a: { label: a.label, ...a.window },
    period_b: { label: b.label, ...b.window },
    comparable: insight.comparable,
    np_before: change.np0,
    np_after: change.np1,
    delta: change.delta,
    delta_pct: deltaPct(change.np1, change.np0),
    effects: effectRows(change).map((e) => ({ label: e.label, amount: e.amount })),
    top_product: insight.topProduct ? { label: insight.topProduct.label, delta_gp: insight.topProduct.delta_gp } : null,
    top_channel: insight.topChannel ? { label: insight.topChannel.label, delta_gp: insight.topChannel.delta_gp } : null,
  };
}

function stockRow(r: ForecastRow) {
  return {
    title: r.title,
    status: r.status,
    on_hand: r.on_hand,
    unit: r.unit,
    rate_per_day: r.rate,
    stockout_in_days: r.stockout_in_days,
    lead_time_days: r.lead_time_days,
    reorder_qty: r.reorder_qty,
    idle_capital: r.idle_capital,
  };
}

export function getStockStatus(d: ConsultData, args: { status?: StatusFilter; query?: string; category?: string } = {}) {
  const rows = sortByUrgency(
    filterForecastRows(d.stock, {
      ...DEFAULT_FORECAST_FILTER,
      status: args.status ?? "semua",
      query: args.query ?? "",
      category: args.category ?? null,
    }),
  );
  const count = (s: StatusFilter) => d.stock.filter((r) => r.status === s).length;
  return {
    counts: { habis: count("habis"), kritis: count("kritis"), menipis: count("menipis"), aman: count("aman") },
    matched: rows.length,
    rows: rows.slice(0, MAX_ROWS).map(stockRow),
  };
}

export function getReorderSuggestions(d: ConsultData) {
  const rows = sortByUrgency(d.stock.filter(needsRestock));
  return { count: rows.length, rows: rows.slice(0, MAX_ROWS).map(stockRow) };
}

export function getSlowMovers(d: ConsultData) {
  const s = slowMovingSummary(d.stock);
  return {
    count: s.rows.length,
    total_idle_capital: s.total_idle_capital,
    rows: s.rows.slice(0, MAX_ROWS).map(stockRow),
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const NAMELESS = "Pelanggan tanpa nama";

export function getCustomerStats(d: ConsultData, args: { period?: PeriodArg; idle_days?: number } = {}) {
  const { window, label } = resolvePeriod(args.period ?? "30d", d.today);
  const idleDays = args.idle_days ?? 60;
  const inWin = (day: string | null) => day !== null && day >= window.from && day <= window.to;
  const newCustomers = d.customers.filter((c) => inWin(c.first_day));
  const returning = d.customers.filter((c) => inWin(c.last_order_day) && c.first_day < window.from && c.orders_count > 1);
  const top = [...d.customers].sort((a, b) => b.total_spent - a.total_spent || a.id.localeCompare(b.id)).slice(0, 5);
  const idleOf = (c: CustomerRow) => (c.last_order_day ? daysBetween(c.last_order_day, d.today) : null);
  const lapsed = [...d.customers]
    .sort((a, b) => b.total_spent - a.total_spent || a.id.localeCompare(b.id))
    .slice(0, 20)
    .filter((c) => (idleOf(c) ?? 0) > idleDays)
    .slice(0, 5);
  const row = (c: CustomerRow) => ({
    name: c.name?.trim() || NAMELESS,
    total_spent: c.total_spent,
    orders_count: c.orders_count,
    days_since_last_order: idleOf(c),
  });
  return {
    period: label,
    window,
    new_customers: newCustomers.length,
    returning_customers: returning.length,
    total_customers: d.customers.length,
    top_customers: top.map(row),
    idle_days_threshold: idleDays,
    lapsed_top_customers: lapsed.map(row),
  };
}

export function listInsights(d: ConsultData, args: { status?: InsightStatus | "active" } = {}) {
  const status = args.status ?? "active";
  const rows = d.insights.filter((i) => (status === "active" ? i.status === "new" || i.status === "seen" : i.status === status));
  return { count: rows.length, rows: rows.slice(0, MAX_ROWS).map((i) => ({ title: i.title, body: i.body, severity: i.severity, status: i.status })) };
}

export function getPreferences(d: ConsultData) {
  const rows = d.memory.filter((m) => m.pinned);
  return { count: rows.length, rows: rows.map((m) => ({ kind: m.kind, content: m.content })) };
}

/* ─── Registry ─────────────────────────────────────────────────────────────── */

export const TOOL_NAMES = [
  "get_business_snapshot",
  "get_sales_summary",
  "get_profit_breakdown",
  "explain_profit_change",
  "get_stock_status",
  "get_reorder_suggestions",
  "get_slow_movers",
  "get_customer_stats",
  "list_insights",
  "get_preferences",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any;

/** The single dispatch point: the LLM tool layer and the offline router both go through it. */
export function callTool(name: ToolName, args: Args, d: ConsultData): unknown {
  switch (name) {
    case "get_business_snapshot":
      return getBusinessSnapshot(d);
    case "get_sales_summary":
      return getSalesSummary(d, args);
    case "get_profit_breakdown":
      return getProfitBreakdown(d, args);
    case "explain_profit_change":
      return explainProfitChange(d, args);
    case "get_stock_status":
      return getStockStatus(d, args);
    case "get_reorder_suggestions":
      return getReorderSuggestions(d);
    case "get_slow_movers":
      return getSlowMovers(d);
    case "get_customer_stats":
      return getCustomerStats(d, args);
    case "list_insights":
      return listInsights(d, args);
    case "get_preferences":
      return getPreferences(d);
  }
}

/* ─── Template rendering (offline answers and the grounding fallback) ──────── */

const signed = (n: number) => `${n < 0 ? "turun" : "naik"} ${formatRupiah(Math.abs(n))}`;
const pctText = (p: number | null) => (p === null ? "" : ` (${formatPercent(Math.abs(p))})`);

/** A short Indonesian summary that only quotes numbers from the tool result. */
export function renderToolResult(name: ToolName, result: unknown): string {
  const r = result as Args;
  switch (name) {
    case "get_business_snapshot": {
      const s = r as ReturnType<typeof getBusinessSnapshot>;
      const parts = [
        `Penjualan hari ini ${formatRupiah(s.sales_today.R)} (${s.sales_today.q} pcs), untung kotor ${formatRupiah(s.sales_today.GP)}.`,
        `7 hari terakhir: penjualan ${formatRupiah(s.last_7_days.R.value)}, ${s.last_7_days.R.delta === 0 ? "sama dengan" : signed(s.last_7_days.R.delta)}${pctText(s.last_7_days.R.delta_pct)} dibanding 7 hari sebelumnya; untung bersih ${formatRupiah(s.last_7_days.NP.value)}.`,
      ];
      if (s.margin_warnings.length) parts.push(...s.margin_warnings.map((w) => w.message));
      if (s.critical_stock.length) parts.push(`Stok perlu perhatian: ${s.critical_stock.map((x) => x.title).join(", ")}.`);
      if (s.open_escalated_chats) parts.push(`${s.open_escalated_chats} chat menunggu dibalas.`);
      return parts.join(" ");
    }
    case "get_sales_summary": {
      const s = r as ReturnType<typeof getSalesSummary>;
      if (s.rows.length === 0) return `Belum ada penjualan ${s.period}.`;
      const top = s.rows.slice(0, 3).map((x) => `${x.label} ${formatRupiah(x.R)} (${x.q} pcs)`).join("; ");
      return `Penjualan ${s.period} ${formatRupiah(s.total.R)}, ${s.total.R_delta === 0 ? "sama dengan" : signed(s.total.R_delta)}${pctText(s.total.R_delta_pct)} dibanding periode sebelumnya. Teratas: ${top}.`;
    }
    case "get_profit_breakdown": {
      const s = r as ReturnType<typeof getProfitBreakdown>;
      const head = `Untung kotor ${s.period} ${formatRupiah(s.totals.GP)}${s.totals.margin_pct === null ? "" : ` (margin ${formatPercent(s.totals.margin_pct)})`}, untung bersih ${formatRupiah(s.totals.NP)} setelah pengeluaran ${formatRupiah(s.totals.expenses)}.`;
      const rows = s.rows
        .slice(0, 3)
        .map((x) => `${x.label} ${formatRupiah(x.GP)}${x.margin_pct === null ? "" : ` (margin ${formatPercent(x.margin_pct)})`}`)
        .join("; ");
      const thin = s.thinnest ? ` Margin paling tipis: ${s.thinnest}.` : "";
      return `${head} Per ${s.by === "channel" ? "kanal" : "produk"}: ${rows}.${thin}`;
    }
    case "explain_profit_change": {
      const s = r as ReturnType<typeof explainProfitChange>;
      if (!s.comparable) return "Belum ada data periode pembanding untuk menjelaskan perubahan untung.";
      if (s.delta === 0) return `Untung bersih ${s.period_b.label} sama dengan ${s.period_a.label} (${formatRupiah(s.np_after)}).`;
      const causes = s.effects.slice(0, 3).map((e) => `${e.label.toLowerCase()} ${e.amount < 0 ? "-" : "+"}${formatRupiah(Math.abs(e.amount))}`).join(", ");
      const prod = s.top_product ? ` Produk paling berpengaruh: ${s.top_product.label}.` : "";
      return `Untung bersih ${s.period_b.label} ${signed(s.delta)}${pctText(s.delta_pct)} dibanding ${s.period_a.label} (dari ${formatRupiah(s.np_before)} jadi ${formatRupiah(s.np_after)}). Penyebab terbesar: ${causes}.${prod}`;
    }
    case "get_stock_status": {
      const s = r as ReturnType<typeof getStockStatus>;
      const c = s.counts;
      const rows = s.rows.slice(0, 3).map((x) => `${x.title} (${x.on_hand} ${x.unit}, ${x.status})`).join("; ");
      return `Stok: ${c.habis} habis, ${c.kritis} kritis, ${c.menipis} menipis, ${c.aman} aman.${rows ? ` Teratas: ${rows}.` : ""}`;
    }
    case "get_reorder_suggestions": {
      const s = r as ReturnType<typeof getReorderSuggestions>;
      if (s.count === 0) return "Semua stok masih aman, belum ada yang perlu dipesan ulang.";
      const rows = s.rows
        .slice(0, 5)
        .map((x) => `${x.title}: pesan ${x.reorder_qty} ${x.unit}${x.stockout_in_days === null ? "" : `, habis ±${x.stockout_in_days} hari lagi`}`)
        .join("; ");
      return `${s.count} produk perlu dipesan ulang. ${rows}.`;
    }
    case "get_slow_movers": {
      const s = r as ReturnType<typeof getSlowMovers>;
      if (s.count === 0) return "Tidak ada barang lambat laku saat ini.";
      const rows = s.rows.slice(0, 3).map((x) => `${x.title} (${formatRupiah(x.idle_capital)})`).join("; ");
      return `${s.count} barang lambat laku menahan modal ${formatRupiah(s.total_idle_capital)}. Terbesar: ${rows}.`;
    }
    case "get_customer_stats": {
      const s = r as ReturnType<typeof getCustomerStats>;
      const top = s.top_customers.slice(0, 3).map((c) => `${c.name} ${formatRupiah(c.total_spent)}`).join("; ");
      const lapsed = s.lapsed_top_customers.length
        ? ` Pelanggan top belum beli > ${s.idle_days_threshold} hari: ${s.lapsed_top_customers.map((c) => `${c.name} (${c.days_since_last_order} hari)`).join(", ")}.`
        : "";
      return `${s.period}: ${s.new_customers} pelanggan baru, ${s.returning_customers} kembali beli. Pelanggan terbaik: ${top || "belum ada"}.${lapsed}`;
    }
    case "list_insights": {
      const s = r as ReturnType<typeof listInsights>;
      return s.count === 0 ? "Belum ada insight aktif." : `${s.count} insight aktif: ${s.rows.map((x) => x.title).join("; ")}.`;
    }
    case "get_preferences": {
      const s = r as ReturnType<typeof getPreferences>;
      return s.count === 0 ? "Belum ada preferensi tersimpan." : `Yang kuingat: ${s.rows.map((x) => x.content).join("; ")}.`;
    }
  }
}
