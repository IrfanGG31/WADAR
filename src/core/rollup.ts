/**
 * Daily rollups (TECH-SPEC §7.1/§7.2): `fin_daily_rollup` and `stock_daily_rollup` are
 * filled from the transactions by the SQL function `rollup_daily` (migration
 * 20261017140000). This module only decides which closed days each shop gets and
 * reports the run; the numbers are computed in SQL. Pure — the caller passes `now`.
 *
 * Idempotent: `rollup_daily` replaces the rows of a (shop, day range) in one transaction,
 * so the cron re-running (or a manual backfill over the same days) yields the same rows.
 */
import { addDays, isoDateInZone, type PeriodWindow } from "./period";

export const DEFAULT_ROLLUP_DAYS = 2;
export const MAX_ROLLUP_DAYS = 31;

export interface RollupShop {
  id: string;
  timezone: string;
}

export interface RollupCounts {
  fin_rows: number;
  stock_rows: number;
}

export interface RollupDeps {
  listShops(): Promise<RollupShop[]>;
  rollup(tenantId: string, window: PeriodWindow): Promise<RollupCounts>;
}

export interface RollupReport extends RollupCounts {
  ran_at: string;
  days: number;
  /** Shops rolled up successfully. */
  shops: number;
  /** tenant_id null = the shop list itself could not be read. */
  errors: { tenant_id: string | null; error: string }[];
}

export function clampRollupDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_ROLLUP_DAYS;
  return Math.min(MAX_ROLLUP_DAYS, Math.max(1, Math.trunc(days)));
}

/** The last `days` days that are already over in `timeZone` (yesterday backwards); today is never rolled up. */
export function rollupWindow(now: Date, timeZone: string, days: number): PeriodWindow {
  const yesterday = addDays(isoDateInZone(now, timeZone), -1);
  return { from: addDays(yesterday, -(clampRollupDays(days) - 1)), to: yesterday };
}

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e));

/** One shop after another; a failing shop is reported and the others still run. */
export async function runDailyRollup(deps: RollupDeps, now: Date, days = DEFAULT_ROLLUP_DAYS): Promise<RollupReport> {
  const n = clampRollupDays(days);
  const report: RollupReport = { ran_at: now.toISOString(), days: n, shops: 0, fin_rows: 0, stock_rows: 0, errors: [] };
  let shops: RollupShop[];
  try {
    shops = await deps.listShops();
  } catch (e) {
    report.errors.push({ tenant_id: null, error: message(e) });
    return report;
  }
  for (const shop of shops) {
    try {
      const r = await deps.rollup(shop.id, rollupWindow(now, shop.timezone, n));
      report.shops += 1;
      report.fin_rows += r.fin_rows;
      report.stock_rows += r.stock_rows;
    } catch (e) {
      report.errors.push({ tenant_id: shop.id, error: message(e) });
    }
  }
  return report;
}
