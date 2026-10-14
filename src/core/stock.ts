/**
 * Stock Intelligence — pure functions over daily sales history (TECH-SPEC §7.1).
 *
 * All inputs are plain integers; money is bigint-compatible integers (rupiah),
 * no fractional currency. The caller feeds in up to 56 days of history ordered
 * oldest → newest; this module decides the valid-day window, computes the sell
 * rate, safety stock, reorder point, status, and reorder quantity, and does
 * not read from the database or the network.
 */
import { levelStatus, type StockStatus } from "./stock-level";

export const EWMA_ALPHA = 0.2;
export const WINDOW_VALID_DAYS = 28;
export const MIN_VALID_DAYS_FOR_EWMA = 7;
export const SERVICE_LEVEL_Z = 1.65; // ±95%
export const DEFAULT_COVER_DAYS = 14;
export const SLOW_MOVING_IDLE_DAYS = 30;
export const SLOW_MOVING_COVER_DAYS = 90;

export interface StockDailyRow {
  /** ISO date "YYYY-MM-DD" for the shop's local day. */
  day: string;
  /** On-hand at the start of the day — days where opening ≤ 0 are not counted so sold-out days don't bias the rate down. */
  opening: number;
  /** Sum of units sold that day (positive). */
  sold: number;
}

export interface StockInput {
  on_hand: number;
  avg_cost: number;
  min_stock: number;
  lead_time_days: number;
  pack_size: number;
  /** Chronological, newest row last. Rows beyond the valid-day window are ignored. */
  daily: readonly StockDailyRow[];
  cover_days?: number;
}

export interface StockForecast {
  /** EWMA sell rate per valid day (unit/day), 0 when no sales. */
  v: number;
  /** Sample standard deviation of daily sold over the valid-day window; 0 when < 2 points. */
  sigma: number;
  safety_stock: number;
  rop: number;
  /** on_hand / v. Infinity when v = 0. */
  days_left: number;
  /** floor(days_left), or null when v = 0. */
  stockout_in_days: number | null;
  status: StockStatus;
  reorder_qty: number;
  slow_moving: boolean;
  /** on_hand × avg_cost — only meaningful when slow_moving. */
  idle_capital: number;
}

/** Business-day EWMA (α = 0.2) over up to {@link WINDOW_VALID_DAYS} valid days. */
function ewmaRate(validSold: readonly number[]): number {
  if (validSold.length === 0) return 0;
  if (validSold.length < MIN_VALID_DAYS_FOR_EWMA) {
    return validSold.reduce((s, n) => s + n, 0) / validSold.length;
  }
  let m = validSold[0];
  for (let i = 1; i < validSold.length; i++) m = EWMA_ALPHA * validSold[i] + (1 - EWMA_ALPHA) * m;
  return m;
}

/** Sample standard deviation (N-1). Returns 0 for < 2 points. */
function sampleStdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, n) => s + n, 0) / xs.length;
  const sq = xs.reduce((s, n) => s + (n - mean) ** 2, 0);
  return Math.sqrt(sq / (xs.length - 1));
}

/** Round up to the nearest multiple of `step` (step ≥ 1). */
function roundUpTo(x: number, step: number): number {
  const s = Math.max(1, Math.floor(step));
  if (x <= 0) return 0;
  return Math.ceil(x / s) * s;
}

export function forecastStock(input: StockInput): StockForecast {
  const cover = Math.max(0, input.cover_days ?? DEFAULT_COVER_DAYS);
  const lead = Math.max(0, input.lead_time_days);
  const packSize = Math.max(1, Math.floor(input.pack_size));

  const valid = input.daily.filter((d) => d.opening > 0).slice(-WINDOW_VALID_DAYS);
  const soldSeries = valid.map((d) => Math.max(0, d.sold));

  const v = ewmaRate(soldSeries);
  const sigma = sampleStdev(soldSeries);

  const safety_stock = Math.ceil(SERVICE_LEVEL_Z * sigma * Math.sqrt(lead));
  const rop = Math.ceil(v * lead + safety_stock);

  const days_left = v > 0 ? input.on_hand / v : Number.POSITIVE_INFINITY;
  const stockout_in_days = v > 0 ? Math.max(0, Math.floor(days_left)) : null;

  const level = levelStatus(input.on_hand, Math.max(rop, input.min_stock));
  let status: StockStatus = level;
  if (level !== "habis" && v > 0 && days_left <= lead) status = "kritis";

  const reorder_qty = roundUpTo(Math.max(0, v * (lead + cover) + safety_stock - input.on_hand), packSize);

  // Slow moving: stock on hand but no sales in SLOW_MOVING_IDLE_DAYS, or cover > SLOW_MOVING_COVER_DAYS.
  const soldLastIdleDays = input.daily.slice(-SLOW_MOVING_IDLE_DAYS).reduce((s, d) => s + Math.max(0, d.sold), 0);
  const noRecentSales = soldLastIdleDays === 0;
  const coverTooLong = v > 0 && input.on_hand / v > SLOW_MOVING_COVER_DAYS;
  const slow_moving = input.on_hand > 0 && (noRecentSales || coverTooLong);
  const idle_capital = Math.max(0, input.on_hand) * Math.max(0, input.avg_cost);

  return { v, sigma, safety_stock, rop, days_left, stockout_in_days, status, reorder_qty, slow_moving, idle_capital };
}

/** Short human-friendly narrative line used by Stock Intelligence cards (STK-7). */
export function narrateForecast(name: string, f: StockForecast, unit = "pcs"): string {
  if (f.status === "habis") return `${name} habis. Segera restock.`;
  if (f.status === "kritis" && f.stockout_in_days !== null) {
    return `${name} habis ±${f.stockout_in_days} hari lagi. Disarankan pesan ulang ${f.reorder_qty} ${unit}.`;
  }
  if (f.status === "menipis") {
    return `${name} menipis. Disarankan pesan ulang ${f.reorder_qty} ${unit}.`;
  }
  return `${name} aman.`;
}
