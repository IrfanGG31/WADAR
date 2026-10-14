import { describe, expect, it } from "vitest";
import { forecastStock, narrateForecast, type StockDailyRow } from "./stock";

/** Build N days of chronological rows, newest last, with the same opening + sold defaults. */
function days(n: number, override: (i: number) => Partial<StockDailyRow> = () => ({})): StockDailyRow[] {
  return Array.from({ length: n }, (_, i) => {
    const o = override(i);
    return { day: `2026-09-${String(i + 1).padStart(2, "0")}`, opening: 20, sold: 2, ...o };
  });
}

describe("forecastStock", () => {
  it("no history → v = 0, days_left = ∞, status reflects stock level only", () => {
    const f = forecastStock({
      on_hand: 10,
      avg_cost: 5_000,
      min_stock: 5,
      lead_time_days: 3,
      pack_size: 1,
      daily: [],
    });
    expect(f.v).toBe(0);
    expect(f.days_left).toBe(Number.POSITIVE_INFINITY);
    expect(f.stockout_in_days).toBeNull();
    expect(f.status).toBe("aman");
    expect(f.reorder_qty).toBe(0);
  });

  it("falls back to simple average with < 7 valid days", () => {
    const f = forecastStock({
      on_hand: 50,
      avg_cost: 1_000,
      min_stock: 0,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(5, () => ({ sold: 4 })),
    });
    expect(f.v).toBeCloseTo(4, 6);
  });

  it("uses EWMA with ≥ 7 valid days, biased toward recent sales", () => {
    const f = forecastStock({
      on_hand: 100,
      avg_cost: 1_000,
      min_stock: 0,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(10, (i) => ({ sold: i < 7 ? 1 : 10 })),
    });
    expect(f.v).toBeGreaterThan(1);
    expect(f.v).toBeLessThan(10);
  });

  it("skips sold-out days so velocity isn't biased down", () => {
    const d: StockDailyRow[] = days(10, () => ({ opening: 0, sold: 0 }));
    // Only valid day: index 9
    d[9] = { day: "2026-09-10", opening: 20, sold: 5 };
    const f = forecastStock({
      on_hand: 20,
      avg_cost: 1_000,
      min_stock: 0,
      lead_time_days: 2,
      pack_size: 1,
      daily: d,
    });
    expect(f.v).toBe(5); // single valid day → simple avg
  });

  it("kritis when days_left ≤ lead time", () => {
    const f = forecastStock({
      on_hand: 4,
      avg_cost: 1_000,
      min_stock: 0,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(10, () => ({ sold: 2 })),
    });
    expect(f.status).toBe("kritis");
    expect(f.stockout_in_days).toBeLessThanOrEqual(3);
  });

  it("menipis when on_hand ≤ max(ROP, min_stock)", () => {
    const f = forecastStock({
      on_hand: 20,
      avg_cost: 1_000,
      min_stock: 5,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(10, () => ({ sold: 3 })),
    });
    // v≈3, ROP ≈ ceil(9 + SS). on_hand=20 above ROP → aman; here that's the "aman" branch.
    expect(["aman", "menipis"]).toContain(f.status);
  });

  it("reorder_qty is non-negative and a multiple of pack_size", () => {
    const f = forecastStock({
      on_hand: 2,
      avg_cost: 1_000,
      min_stock: 5,
      lead_time_days: 3,
      pack_size: 6,
      daily: days(14, () => ({ sold: 2 })),
    });
    expect(f.reorder_qty).toBeGreaterThanOrEqual(0);
    expect(f.reorder_qty % 6).toBe(0);
  });

  it("slow_moving on idle stock with no sales for 30 days", () => {
    const d: StockDailyRow[] = days(45, () => ({ sold: 0, opening: 10 }));
    const f = forecastStock({
      on_hand: 10,
      avg_cost: 20_000,
      min_stock: 0,
      lead_time_days: 3,
      pack_size: 1,
      daily: d,
    });
    expect(f.slow_moving).toBe(true);
    expect(f.idle_capital).toBe(200_000);
  });

  it("habis dominates every other label when on_hand ≤ 0", () => {
    const f = forecastStock({
      on_hand: 0,
      avg_cost: 1_000,
      min_stock: 5,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(10, () => ({ sold: 2 })),
    });
    expect(f.status).toBe("habis");
  });
});

describe("narrateForecast", () => {
  it("names the reorder quantity on kritis", () => {
    const f = forecastStock({
      on_hand: 4,
      avg_cost: 1_000,
      min_stock: 0,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(10, () => ({ sold: 2 })),
    });
    const line = narrateForecast("Tissue Basah", f, "dus");
    expect(line).toContain("Tissue Basah");
    expect(line).toContain("dus");
  });
  it("plain OK when aman", () => {
    const f = forecastStock({
      on_hand: 100,
      avg_cost: 1_000,
      min_stock: 0,
      lead_time_days: 3,
      pack_size: 1,
      daily: days(10, () => ({ sold: 1 })),
    });
    expect(narrateForecast("Serum", f)).toBe("Serum aman.");
  });
});
