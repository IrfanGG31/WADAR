import { describe, expect, it } from "vitest";
import { ewma, forecastStock, shouldAlertLow } from "./forecast.js";

const flat = (perDay: number) => Array.from({ length: 28 }, () => perDay);

describe("forecastStock", () => {
  it("steady 5/day with 20 on hand → 4 days left, reorder to cover 14 days", () => {
    expect(forecastStock(flat(5), 20)).toEqual({ dailyRate: 5, daysLeft: 4, reorderQty: 50 });
  });

  it("no sales history → no estimate (not 'infinite')", () => {
    expect(forecastStock(flat(0), 10)).toEqual({ dailyRate: 0, daysLeft: null, reorderQty: 0 });
  });

  it("out of stock → 0 days", () => {
    expect(forecastStock(flat(2), -3).daysLeft).toBe(0);
  });

  it("a recent surge raises the rate more than an old one", () => {
    const recent = [...flat(1).slice(0, 25), 10, 10, 10];
    const old = [10, 10, 10, ...flat(1).slice(0, 25)];
    expect(forecastStock(recent, 30).dailyRate).toBeGreaterThan(forecastStock(old, 30).dailyRate);
  });

  it("ewma of a constant is the constant", () => {
    expect(ewma([3, 3, 3, 3], 14)).toBe(3);
  });
});

describe("shouldAlertLow", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  it("fires under 7 days, then waits 24 h", () => {
    const low = { dailyRate: 5, daysLeft: 3, reorderQty: 60 };
    expect(shouldAlertLow(low, null, now)).toBe(true);
    expect(shouldAlertLow(low, new Date("2026-09-26T01:00:00Z"), now)).toBe(false);
    expect(shouldAlertLow(low, new Date("2026-09-25T09:00:00Z"), now)).toBe(true);
    expect(shouldAlertLow({ dailyRate: 1, daysLeft: 9, reorderQty: 5 }, null, now)).toBe(false);
    expect(shouldAlertLow({ dailyRate: 0, daysLeft: null, reorderQty: 0 }, null, now)).toBe(false);
  });
});
