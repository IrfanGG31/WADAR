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
