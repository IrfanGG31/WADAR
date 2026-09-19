import { describe, expect, it } from "vitest";
import { formatDateIndonesian, formatMonthYearIndonesian, formatRelativeTime } from "./date.js";

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
