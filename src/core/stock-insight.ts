/**
 * Stock Intelligence screen helpers (D5): map {@link forecastStock} output to
 * table rows, filter them, summarise slow movers, and narrate — all pure, no
 * I/O. Every number shown on the Stok screens is copied from a
 * {@link StockForecast}; nothing here re-derives velocity, ROP or reorder qty.
 */
import { formatRupiah } from "./money";
import { formatCount, formatDecimal } from "./number-format";
import { narrateForecast, SLOW_MOVING_COVER_DAYS, SLOW_MOVING_IDLE_DAYS, type StockForecast } from "./stock";
import type { StockStatus } from "./stock-level";

/** Catalog facts about one variant, as read from the database. */
export interface StockItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  option_label: string | null;
  category: string | null;
  unit: string;
  on_hand: number;
  avg_cost: number;
  cost_is_set: boolean;
  min_stock: number;
  lead_time_days: number;
  pack_size: number;
}

/** One row of the Prediksi & Rekomendasi table. Plain JSON (no Infinity) so it can cross to a client component. */
export interface ForecastRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  option_label: string | null;
  title: string;
  category: string | null;
  unit: string;
  on_hand: number;
  min_stock: number;
  lead_time_days: number;
  pack_size: number;
  cost_is_set: boolean;
  /** Sell rate per day (EWMA) — `forecast.v`. */
  rate: number;
  safety_stock: number;
  rop: number;
  /** `forecast.days_left`, or null when there is no sales rate (∞). */
  days_left: number | null;
  stockout_in_days: number | null;
  status: StockStatus;
  reorder_qty: number;
  slow_moving: boolean;
  /** on_hand × avg_cost — shown as "modal tertahan" for slow movers. */
  idle_capital: number;
  narrative: string;
}

export const NO_CATEGORY = "Tanpa kategori";

const STATUS_RANK: Record<StockStatus, number> = { habis: 0, kritis: 1, menipis: 2, aman: 3 };

/** "Serum Vit C — 30 ml", or just the product name. */
export function itemTitle(item: Pick<StockItem, "product_name" | "option_label">): string {
  return item.option_label ? `${item.product_name} — ${item.option_label}` : item.product_name;
}

export function toForecastRow(item: StockItem, f: StockForecast): ForecastRow {
  const title = itemTitle(item);
  return {
    variant_id: item.variant_id,
    product_id: item.product_id,
    product_name: item.product_name,
    option_label: item.option_label,
    title,
    category: item.category,
    unit: item.unit,
    on_hand: item.on_hand,
    min_stock: item.min_stock,
    lead_time_days: item.lead_time_days,
    pack_size: item.pack_size,
    cost_is_set: item.cost_is_set,
    rate: f.v,
    safety_stock: f.safety_stock,
    rop: f.rop,
    days_left: Number.isFinite(f.days_left) ? f.days_left : null,
    stockout_in_days: f.stockout_in_days,
    status: f.status,
    reorder_qty: f.reorder_qty,
    slow_moving: f.slow_moving,
    idle_capital: f.idle_capital,
    narrative: narrateForecast(title, f, item.unit),
  };
}

/** Most urgent first: habis → kritis → menipis → aman, then soonest stock-out, then name. */
export function sortByUrgency(rows: readonly ForecastRow[]): ForecastRow[] {
  return [...rows].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (a.days_left ?? Number.POSITIVE_INFINITY) - (b.days_left ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title, "id"),
  );
}

/** Restock now = status Habis / Kritis / Menipis (on hand ≤ ROP or minimum, or runs out within lead time). */
export function needsRestock(row: Pick<ForecastRow, "status">): boolean {
  return row.status !== "aman";
}

export type StatusFilter = "semua" | StockStatus;

export interface ForecastFilter {
  status: StatusFilter;
  /** A category name, {@link NO_CATEGORY}, or null for every category. */
  category: string | null;
  restockOnly: boolean;
  slowOnly: boolean;
  query: string;
}

export const DEFAULT_FORECAST_FILTER: ForecastFilter = {
  status: "semua",
  category: null,
  restockOnly: false,
  slowOnly: false,
  query: "",
};

export function categoryOf(row: Pick<ForecastRow, "category">): string {
  return row.category ?? NO_CATEGORY;
}

export function filterForecastRows(rows: readonly ForecastRow[], filter: ForecastFilter): ForecastRow[] {
  const needle = filter.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (filter.status === "semua" || r.status === filter.status) &&
      (filter.category === null || categoryOf(r) === filter.category) &&
      (!filter.restockOnly || needsRestock(r)) &&
      (!filter.slowOnly || r.slow_moving) &&
      (!needle || `${r.title} ${r.category ?? ""}`.toLowerCase().includes(needle)),
  );
}

export function countByStatus(rows: readonly ForecastRow[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { semua: rows.length, habis: 0, kritis: 0, menipis: 0, aman: 0 };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

/** Category names present in the rows, alphabetical, {@link NO_CATEGORY} last. */
export function categoriesOf(rows: readonly ForecastRow[]): string[] {
  const names = new Set(rows.map(categoryOf));
  const hasNone = names.delete(NO_CATEGORY);
  return [...[...names].sort((a, b) => a.localeCompare(b, "id")), ...(hasNone ? [NO_CATEGORY] : [])];
}

export interface SlowMovingSummary {
  /** Slow movers, largest idle capital first (STK-4). */
  rows: ForecastRow[];
  total_idle_capital: number;
}

export function slowMovingSummary(rows: readonly ForecastRow[]): SlowMovingSummary {
  const slow = rows
    .filter((r) => r.slow_moving)
    .sort((a, b) => b.idle_capital - a.idle_capital || a.title.localeCompare(b.title, "id"));
  return { rows: slow, total_idle_capital: slow.reduce((s, r) => s + r.idle_capital, 0) };
}

/* ─── Display + narration (STK-7: template only, every number from the row) ─ */

/** 2.437 → "2,4/hari"; 0 → "0/hari". */
export function formatRate(rate: number): string {
  return `${formatDecimal(rate)}/hari`;
}

/** "±3 hari"; "Sudah habis" at zero stock; "—" when nothing sells (no stock-out date). */
export function formatDaysLeft(row: Pick<ForecastRow, "stockout_in_days" | "status">): string {
  if (row.status === "habis") return "Sudah habis";
  return row.stockout_in_days === null ? "—" : `±${formatCount(row.stockout_in_days)} hari`;
}

/** Why a slow mover is flagged, with its idle capital. */
export function narrateSlowMoving(row: ForecastRow): string {
  const capital = formatRupiah(row.idle_capital);
  if (row.days_left !== null && row.days_left > SLOW_MOVING_COVER_DAYS && row.stockout_in_days !== null) {
    return `${row.title} lambat laku: stok ${row.on_hand} ${row.unit} baru habis ±${row.stockout_in_days} hari lagi. Modal tertahan ${capital}.`;
  }
  return `${row.title} tidak terjual ${SLOW_MOVING_IDLE_DAYS} hari terakhir. Modal tertahan ${capital} (${row.on_hand} ${row.unit}).`;
}

/** One-line overview for the top of the Prediksi tab. */
export function narrateStockOverview(rows: readonly ForecastRow[]): string {
  const restock = rows.filter(needsRestock).length;
  const slow = slowMovingSummary(rows);
  const parts: string[] = [];
  if (restock > 0) parts.push(`${restock} produk perlu dipesan ulang`);
  if (slow.rows.length > 0) {
    parts.push(`${slow.rows.length} produk lambat laku menahan modal ${formatRupiah(slow.total_idle_capital)}`);
  }
  if (parts.length === 0) return "Semua stok aman dan tidak ada barang lambat laku.";
  return `${parts.join(" dan ")}.`;
}
