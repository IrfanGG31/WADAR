/**
 * Calendar windows over ISO dates ("YYYY-MM-DD", the shop's local day — the
 * same key `fin_daily.day` and `expenses.occurred_at` use). Pure: the caller
 * passes `now`, this module never reads the clock.
 */

export interface PeriodWindow {
  /** Inclusive first day. */
  from: string;
  /** Inclusive last day. */
  to: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in `timeZone` as "YYYY-MM-DD" (en-CA formats dates that way). */
export function isoDateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "2026-10-15" + 3 → "2026-10-18"; works across month/year ends (UTC calendar math, no DST). */
export function addDays(iso: string, days: number): string {
  if (!ISO_DAY.test(iso)) throw new RangeError(`addDays: expected YYYY-MM-DD, got "${iso}"`);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The last `days` days ending at `today` (inclusive). */
export function lastDays(today: string, days: number): PeriodWindow {
  return { from: addDays(today, -(Math.max(1, days) - 1)), to: today };
}

/** Every day of the window, oldest first. */
export function daysOf(window: PeriodWindow): string[] {
  const out: string[] = [];
  for (let day = window.from; day <= window.to; day = addDays(day, 1)) out.push(day);
  return out;
}

export function inWindow(day: string, window: PeriodWindow): boolean {
  return day >= window.from && day <= window.to;
}

/**
 * "Minggu ini vs minggu lalu" as rolling 7-day windows (TECH-SPEC §7.2 FIN-5):
 * current = today−6 … today, previous = today−13 … today−7.
 */
export function weekOverWeek(today: string): { current: PeriodWindow; previous: PeriodWindow } {
  const current = lastDays(today, 7);
  return { current, previous: lastDays(addDays(current.from, -1), 7) };
}
