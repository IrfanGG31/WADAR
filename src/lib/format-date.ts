/** "14 Okt, 16.05" in the shop's time zone. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Rabu, 14 Oktober" in the shop's time zone (day headers). */
export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

/** "16.05" in the shop's time zone. */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Kam, 15 Okt" for a calendar date "YYYY-MM-DD" (already the shop's local day — no zone shift). */
export function formatIsoDay(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** "15 Okt" for a calendar date "YYYY-MM-DD". */
export function formatIsoDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** "Kam 15" — weekday + day number for narrow chart labels. */
export function formatIsoWeekday(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
