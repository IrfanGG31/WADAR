import { addDays, daysOf, type PeriodWindow } from "./period";

/**
 * Which source answers each day of a dashboard window (U1 rollups):
 * `fin_daily_rollup` / `stock_daily_rollup` for closed days that were rolled
 * up, the live view (`fin_daily` / `stock_daily_series`) for today and for any
 * day without rollup rows. Both sources compute the same numbers for a closed
 * day, so the screens show the same figures either way — the rollup only saves
 * walking every sale line again.
 */
export interface DailySourcePlan {
  /** Closed days read from the rollup table. */
  rollupDays: ReadonlySet<string>;
  /** Contiguous ranges still read live (today is always among them when it is in the window). */
  live: PeriodWindow[];
}

/** More live ranges than this are fetched as one range (fewer round-trips; rows are filtered anyway). */
export const MAX_LIVE_RANGES = 3;

export function planDailySource(
  window: PeriodWindow,
  today: string,
  rolledDays: ReadonlySet<string>,
  maxRanges = MAX_LIVE_RANGES,
): DailySourcePlan {
  const rollupDays = new Set<string>();
  const live: PeriodWindow[] = [];
  for (const day of daysOf(window)) {
    if (day < today && rolledDays.has(day)) {
      rollupDays.add(day);
      continue;
    }
    const last = live.at(-1);
    if (last && addDays(last.to, 1) === day) last.to = day;
    else live.push({ from: day, to: day });
  }
  if (live.length > maxRanges) return { rollupDays, live: [{ from: live[0].from, to: live.at(-1)!.to }] };
  return { rollupDays, live };
}

/**
 * Rows of the window from both sources, without double counting: a rolled-up
 * day takes only rollup rows, every other day only live rows. Order follows the
 * input (callers sort when they need to).
 */
export function mergeDailyRows<R extends { day: string }>(
  plan: DailySourcePlan,
  window: PeriodWindow,
  rollupRows: readonly R[],
  liveRows: readonly R[],
): R[] {
  const inside = (day: string) => day >= window.from && day <= window.to;
  return [
    ...rollupRows.filter((r) => plan.rollupDays.has(r.day)),
    ...liveRows.filter((r) => inside(r.day) && !plan.rollupDays.has(r.day)),
  ];
}

/** Days that have at least one rollup row (a rolled-up day with no sales has none in fin_daily_rollup and stays live). */
export function daysWithRows(rows: readonly { day: string }[]): Set<string> {
  return new Set(rows.map((r) => r.day));
}
