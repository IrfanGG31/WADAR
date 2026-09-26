/**
 * Indonesian date formatting (docs/BUILD-PLAN.md M1 cakupan: "format Rupiah
 * & tanggal Indonesia di packages/core" — mirrors money.ts's stance of
 * leaning on the platform's own ICU data (`Intl.*`) instead of a date
 * library dependency).
 */

/** WIB — used when a caller doesn't have a tenant's actual timezone on hand yet. */
const DEFAULT_TIMEZONE = "Asia/Jakarta";

const relativeFormatter = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * "2 hari yang lalu", "kemarin", "5 menit yang lalu" — for things like
 * "undangan dikirim 2 hari lalu" (PRD §4 UX bahasa awam).
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  if (absMs < MINUTE_MS) return relativeFormatter.format(Math.round(diffMs / SECOND_MS), "second");
  if (absMs < HOUR_MS) return relativeFormatter.format(Math.round(diffMs / MINUTE_MS), "minute");
  if (absMs < DAY_MS) return relativeFormatter.format(Math.round(diffMs / HOUR_MS), "hour");
  if (absMs < WEEK_MS) return relativeFormatter.format(Math.round(diffMs / DAY_MS), "day");
  if (absMs < MONTH_MS) return relativeFormatter.format(Math.round(diffMs / WEEK_MS), "week");
  if (absMs < YEAR_MS) return relativeFormatter.format(Math.round(diffMs / MONTH_MS), "month");
  return relativeFormatter.format(Math.round(diffMs / YEAR_MS), "year");
}

/**
 * "19 Sep 2026". `timeZone` should be the tenant's own timezone
 * (`tenants.timezone`, CLAUDE.md konvensi: "zona waktu tenant untuk
 * tampilan") — defaults to WIB only when the caller doesn't have it yet.
 */
export function formatDateIndonesian(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone }).format(
    date,
  );
}

/** "Sep 2026" — for things like "bergabung sejak Sep 2026". */
export function formatMonthYearIndonesian(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone }).format(date);
}

function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "19 Sep 2026 10.05" in the tenant's timezone. */
export function formatDateTimeId(value: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
    .format(toDate(value))
    .replace(",", "");
}

/** "10.05" in the tenant's timezone. */
export function formatTimeId(value: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone }).format(toDate(value));
}

/**
 * Indonesia has no daylight saving time, so each of the 3 tenant timezones
 * (PRD X7) is a fixed UTC offset — which lets business-day math stay exact
 * and dependency-free.
 */
const UTC_OFFSET_MINUTES: Record<string, number> = {
  "Asia/Jakarta": 7 * 60,
  "Asia/Makassar": 8 * 60,
  "Asia/Jayapura": 9 * 60,
};

function offsetMinutes(timeZone: string): number {
  return UTC_OFFSET_MINUTES[timeZone] ?? UTC_OFFSET_MINUTES[DEFAULT_TIMEZONE]!;
}

/** The tenant-local business day ("2026-09-19") an instant falls on. */
export function localDateKey(value: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const shifted = new Date(toDate(value).getTime() + offsetMinutes(timeZone) * MINUTE_MS);
  return shifted.toISOString().slice(0, 10);
}

/** "2026-09-19" + n days. */
export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** [start, end) instants of a tenant-local day. */
export function localDayRange(dateKey: string, timeZone: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
  const start = new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() - offsetMinutes(timeZone) * MINUTE_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** "Sab, 19 Sep" for a date key — chart axes and day headers. */
export function formatDateKeyShort(dateKey: string): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${dateKey}T00:00:00.000Z`),
  );
}
