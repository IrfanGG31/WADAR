import { addDays, localDateKey } from "@wadar/core/date";

export type Period = "hari-ini" | "kemarin" | "7-hari" | "bulan-ini" | "30-hari";

export const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "hari-ini", label: "Hari ini" },
  { key: "kemarin", label: "Kemarin" },
  { key: "7-hari", label: "7 hari" },
  { key: "bulan-ini", label: "Bulan ini" },
  { key: "30-hari", label: "30 hari" },
];

export function parsePeriod(value: string | undefined): Period {
  return PERIODS.some((p) => p.key === value) ? (value as Period) : "hari-ini";
}

/** Tenant-local [from, to] date keys (inclusive) for a period. */
export function periodRange(period: Period, timezone: string, now = new Date()): { from: string; to: string } {
  const today = localDateKey(now, timezone);
  switch (period) {
    case "hari-ini":
      return { from: today, to: today };
    case "kemarin":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7-hari":
      return { from: addDays(today, -6), to: today };
    case "30-hari":
      return { from: addDays(today, -29), to: today };
    case "bulan-ini":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}
