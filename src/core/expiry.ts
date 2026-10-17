/**
 * Risiko kedaluwarsa (STK-5). A variant may carry one optional expiry date
 * (`variants.expires_on`, migration 20261017070121_variant_expiry) — the
 * nearest one for the stock on hand; batches are not tracked. Pure helpers:
 * whole-day counts on the shop's calendar date, which variants to warn about,
 * and a plain sentence for each. When the Stock Intelligence sell rate is
 * known, the sentence says how much is likely still unsold on that day.
 */
import { formatCount } from "./number-format";
import { isoDateInZone } from "./period";

/** Warn this many days ahead unless the screen asks otherwise. */
export const DEFAULT_EXPIRY_WINDOW_DAYS = 30;
export const MAX_EXPIRY_WINDOW_DAYS = 365;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayNumber(iso: string): number | null {
  const m = ISO_DAY.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Reject 2026-02-30 and friends instead of rolling over.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 86_400_000;
}

export function isIsoDay(value: string | null | undefined): value is string {
  return typeof value === "string" && dayNumber(value) !== null;
}

/** Whole days from `today` to `expiresOn` (both YYYY-MM-DD, shop calendar): 0 = today, negative = past. */
export function daysUntilExpiry(expiresOn: string, today: string): number | null {
  const a = dayNumber(expiresOn);
  const b = dayNumber(today);
  return a === null || b === null ? null : a - b;
}

/**
 * Same count from a clock instant: "today" is the shop's calendar date in its
 * own timezone (tenants.timezone), not the server's UTC date.
 */
export function daysUntilExpiryAt(expiresOn: string, now: Date, timeZone: string): number | null {
  return daysUntilExpiry(expiresOn, isoDateInZone(now, timeZone));
}

/** `?kedaluwarsa=` → window in days; default 30, 1…365. */
export function parseExpiryWindow(raw: string | string[] | null | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!value || !Number.isInteger(n) || n < 1) return DEFAULT_EXPIRY_WINDOW_DAYS;
  return Math.min(n, MAX_EXPIRY_WINDOW_DAYS);
}

export interface ExpiryItem {
  variant_id: string;
  title: string;
  unit: string;
  on_hand: number;
  expires_on: string | null;
  /** Stock Intelligence sell rate per day; null/undefined when unknown. */
  rate?: number | null;
}

/** lewat = past the date; hampir = today … `windowDays` ahead (inclusive); aman = later. */
export type ExpiryStatus = "lewat" | "hampir" | "aman";

export function expiryStatus(days: number, windowDays = DEFAULT_EXPIRY_WINDOW_DAYS): ExpiryStatus {
  if (days < 0) return "lewat";
  return days <= windowDays ? "hampir" : "aman";
}

/** Days + status for one date; null without a (valid) date. */
export function classifyExpiry(
  expiresOn: string | null | undefined,
  today: string,
  windowDays = DEFAULT_EXPIRY_WINDOW_DAYS,
): { days: number; status: ExpiryStatus } | null {
  if (!expiresOn) return null;
  const days = daysUntilExpiry(expiresOn, today);
  return days === null ? null : { days, status: expiryStatus(days, windowDays) };
}

/**
 * The date to keep after a stock-in (one date per variant = the nearest one
 * for the stock on hand). With stock still on the shelf the earlier date
 * stays; an empty shelf takes the new batch's date. No new date = unchanged.
 */
export function expiryAfterStockIn(current: string | null, onHandBefore: number, incoming: string | null): string | null {
  if (!incoming) return current;
  if (!current || onHandBefore <= 0) return incoming;
  return incoming < current ? incoming : current;
}

export interface ExpiryRisk {
  variant_id: string;
  title: string;
  unit: string;
  on_hand: number;
  expires_on: string;
  /** Negative = already past. */
  days: number;
  status: Exclude<ExpiryStatus, "aman">;
  /** Units likely still on the shelf on the expiry day at the current rate; null without a rate. */
  unsold_at_expiry: number | null;
}

/**
 * Variants with stock that are `lewat` or `hampir` (never `aman`), most
 * urgent first: longest overdue, then the nearest dates; ties by name.
 */
export function expiryRisks(items: readonly ExpiryItem[], today: string, windowDays = DEFAULT_EXPIRY_WINDOW_DAYS): ExpiryRisk[] {
  const risks: ExpiryRisk[] = [];
  for (const item of items) {
    if (!item.expires_on || item.on_hand <= 0) continue;
    const c = classifyExpiry(item.expires_on, today, windowDays);
    if (!c || c.status === "aman") continue;
    const days = c.days;
    const rate = typeof item.rate === "number" && Number.isFinite(item.rate) && item.rate > 0 ? item.rate : null;
    const unsold =
      days < 0 ? item.on_hand : rate === null ? null : Math.max(0, Math.ceil(item.on_hand - rate * days - 1e-9));
    risks.push({
      variant_id: item.variant_id,
      title: item.title,
      unit: item.unit,
      on_hand: item.on_hand,
      expires_on: item.expires_on,
      days,
      status: c.status,
      unsold_at_expiry: unsold,
    });
  }
  return risks.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title, "id"));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-10-29" → "29 Okt 2026". */
export function formatExpiryDate(iso: string): string {
  const m = ISO_DAY.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** One plain sentence per risk; every number comes from the risk row. */
export function narrateExpiry(risk: ExpiryRisk): string {
  const stock = `${formatCount(risk.on_hand)} ${risk.unit}`;
  const date = formatExpiryDate(risk.expires_on);
  if (risk.days < 0) {
    return `${risk.title} sudah lewat tanggal kedaluwarsa ${formatCount(-risk.days)} hari (${date}), masih ada ${stock}. Tarik dari rak dan jangan dijual.`;
  }
  const when = risk.days === 0 ? `kedaluwarsa hari ini (${date})` : `kedaluwarsa ${formatCount(risk.days)} hari lagi (${date})`;
  const base = `${risk.title} ${when}, stok ${stock}.`;
  if (risk.unsold_at_expiry === null || risk.days === 0) return base;
  if (risk.unsold_at_expiry === 0) return `${base} Dengan laju jual sekarang, stok diperkirakan habis sebelum tanggal itu.`;
  return `${base} Dengan laju jual sekarang, ±${formatCount(risk.unsold_at_expiry)} ${risk.unit} diperkirakan belum terjual saat itu — pertimbangkan promo atau bundling.`;
}

/** Headline for the warning box; null when nothing is at risk. */
export function narrateExpiryOverview(risks: readonly ExpiryRisk[], windowDays: number): string | null {
  if (risks.length === 0) return null;
  const past = risks.filter((r) => r.status === "lewat").length;
  const soon = risks.length - past;
  const parts: string[] = [];
  if (past > 0) parts.push(`${formatCount(past)} produk sudah lewat tanggal kedaluwarsa`);
  if (soon > 0) parts.push(`${formatCount(soon)} produk kedaluwarsa dalam ${formatCount(windowDays)} hari`);
  return `${parts.join(" dan ")}.`;
}
