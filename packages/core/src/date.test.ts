import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDateIndonesian,
  formatDateKeyShort,
  formatDateTimeId,
  formatMonthYearIndonesian,
  formatRelativeTime,
  formatTimeId,
  localDateKey,
  localDayRange,
} from "./date.js";

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-19T12:00:00Z");

  it("says 'kemarin' for exactly 1 day ago", () => {
    expect(formatRelativeTime(new Date("2026-09-18T12:00:00Z"), now)).toBe("kemarin");
  });

  it("says 'sekarang' for the same instant", () => {
    expect(formatRelativeTime(now, now)).toBe("sekarang");
  });

  it("formats a few minutes ago", () => {
    expect(formatRelativeTime(new Date("2026-09-19T11:55:00Z"), now)).toBe("5 menit yang lalu");
  });

  it("formats a few days ago", () => {
    expect(formatRelativeTime(new Date("2026-09-16T12:00:00Z"), now)).toBe("3 hari yang lalu");
  });

  it("formats a future instant (not just the past)", () => {
    expect(formatRelativeTime(new Date("2026-09-20T12:00:00Z"), now)).toBe("besok");
  });
});

describe("formatDateIndonesian", () => {
  it("formats as 'D MMM YYYY'", () => {
    expect(formatDateIndonesian(new Date("2026-09-19T00:00:00Z"))).toBe("19 Sep 2026");
  });
});

describe("formatMonthYearIndonesian", () => {
  it("formats as 'MMM YYYY'", () => {
    expect(formatMonthYearIndonesian(new Date("2026-09-19T00:00:00Z"))).toBe("Sep 2026");
  });
});

describe("business-day helpers (tenant timezone)", () => {
  it("localDateKey rolls over at local midnight, not UTC midnight", () => {
    // 2026-09-19 17:30 UTC = 20 Sep 00:30 WIB
    expect(localDateKey("2026-09-19T17:30:00Z", "Asia/Jakarta")).toBe("2026-09-20");
    expect(localDateKey("2026-09-19T16:30:00Z", "Asia/Jakarta")).toBe("2026-09-19");
    // same instant is already 20 Sep in WIT (+9)
    expect(localDateKey("2026-09-19T15:30:00Z", "Asia/Jayapura")).toBe("2026-09-20");
  });

  it("localDayRange covers exactly the local day", () => {
    const { start, end } = localDayRange("2026-09-20", "Asia/Jakarta");
    expect(start.toISOString()).toBe("2026-09-19T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-20T17:00:00.000Z");
  });

  it("addDays crosses month/year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats date-time and short day labels in Indonesian", () => {
    expect(formatDateTimeId("2026-09-19T03:05:00Z", "Asia/Jakarta")).toBe("19 Sep 2026 10.05");
    expect(formatTimeId("2026-09-19T03:05:00Z", "Asia/Makassar")).toBe("11.05");
    expect(formatDateKeyShort("2026-09-19")).toBe("Sab, 19 Sep");
  });
});
