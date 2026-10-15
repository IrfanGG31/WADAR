import { describe, expect, it } from "vitest";
import { addDays, daysOf, inWindow, isoDateInZone, lastDays, weekOverWeek } from "./period";

describe("isoDateInZone", () => {
  it("uses the shop's local day, not UTC", () => {
    const now = new Date("2026-10-14T20:30:00Z"); // 03.30 WIB on the 15th
    expect(isoDateInZone(now, "Asia/Jakarta")).toBe("2026-10-15");
    expect(isoDateInZone(now, "UTC")).toBe("2026-10-14");
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("rejects non-ISO input", () => {
    expect(() => addDays("15/10/2026", 1)).toThrow(RangeError);
  });
});

describe("windows", () => {
  it("lastDays is inclusive of today", () => {
    expect(lastDays("2026-10-15", 7)).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(daysOf(lastDays("2026-10-15", 28))).toHaveLength(28);
  });

  it("weekOverWeek gives two adjacent, non-overlapping 7-day windows", () => {
    const { current, previous } = weekOverWeek("2026-10-15");
    expect(current).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(previous).toEqual({ from: "2026-10-02", to: "2026-10-08" });
    expect(daysOf(previous)).toHaveLength(7);
    expect(inWindow("2026-10-08", current)).toBe(false);
    expect(inWindow("2026-10-08", previous)).toBe(true);
  });
});
