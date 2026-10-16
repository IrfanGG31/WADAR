/**
 * Pelanggan (CRM ringan, PRD Tabel 19 Fase 1): daftar, nilai belanja, dan
 * penanda "pelanggan lama tidak belanja". Pure; rows come from
 * `public.customers` (total_spent / orders_count / last_order_at are kept by
 * `record_sale`).
 */

/** "Lama tidak belanja" = last order MORE than this many days ago. */
export const LAPSED_AFTER_DAYS = 30;

const NAMELESS = "Pelanggan tanpa nama";

export interface CustomerListRow {
  id: string;
  name: string | null;
  phone_e164: string | null;
  total_spent: number;
  orders_count: number;
  /** Shop-local day the customer was first recorded. */
  first_day: string;
  /** Shop-local day of the latest order, null when none. */
  last_order_day: string | null;
}

export type CustomerFilter = "semua" | "tidak-belanja";

/** `?filter=tidak-belanja` → lapsed only; anything else → all. */
export function parseCustomerFilter(raw: string | string[] | undefined): CustomerFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "tidak-belanja" ? "tidak-belanja" : "semua";
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function daysSinceLastOrder(c: CustomerListRow, today: string): number | null {
  return c.last_order_day ? daysBetween(c.last_order_day, today) : null;
}

/** Bought before, but not in the last `after` days. Never-bought customers are not "lama". */
export function isLapsedCustomer(c: CustomerListRow, today: string, after = LAPSED_AFTER_DAYS): boolean {
  const idle = daysSinceLastOrder(c, today);
  return c.orders_count > 0 && idle !== null && idle > after;
}

export interface CustomerView extends CustomerListRow {
  label: string;
  /** Whole rupiah: total_spent ÷ orders_count, rounded; 0 when no orders. */
  avg_order: number;
  days_since: number | null;
  lapsed: boolean;
}

export interface CustomerSummary {
  total: number;
  lapsed: number;
  /** Bought within the last LAPSED_AFTER_DAYS days. */
  active: number;
  total_spent: number;
}

export function customerList(
  rows: readonly CustomerListRow[],
  today: string,
  filter: CustomerFilter,
): { rows: CustomerView[]; summary: CustomerSummary } {
  const all = rows.map(
    (c): CustomerView => ({
      ...c,
      label: c.name?.trim() || NAMELESS,
      avg_order: c.orders_count > 0 ? Math.round(c.total_spent / c.orders_count) : 0,
      days_since: daysSinceLastOrder(c, today),
      lapsed: isLapsedCustomer(c, today),
    }),
  );
  const summary: CustomerSummary = {
    total: all.length,
    lapsed: all.filter((c) => c.lapsed).length,
    active: all.filter((c) => c.days_since !== null && c.days_since <= LAPSED_AFTER_DAYS).length,
    total_spent: all.reduce((s, c) => s + c.total_spent, 0),
  };
  const out =
    filter === "tidak-belanja"
      ? all.filter((c) => c.lapsed).sort((a, b) => b.total_spent - a.total_spent || a.id.localeCompare(b.id))
      : all.sort(
          (a, b) =>
            (a.days_since ?? Infinity) - (b.days_since ?? Infinity) || b.total_spent - a.total_spent || a.id.localeCompare(b.id),
        );
  return { rows: out, summary };
}

/** "Belanja hari ini" / "Terakhir belanja 12 hari lalu" / "Belum pernah belanja". */
export function lastOrderText(daysSince: number | null): string {
  if (daysSince === null) return "Belum pernah belanja";
  if (daysSince <= 0) return "Belanja hari ini";
  if (daysSince === 1) return "Terakhir belanja kemarin";
  return `Terakhir belanja ${daysSince} hari lalu`;
}
