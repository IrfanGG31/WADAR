import { describe, expect, it } from "vitest";
import { applyMovement, stockStatus, type StockLevelState } from "./stock.js";

describe("applyMovement — moving average HPP", () => {
  it("first receipt sets the average", () => {
    expect(applyMovement({ onHand: 0, avgCost: null }, { delta: 10, unitCost: 5000 })).toEqual({ onHand: 10, avgCost: 5000 });
  });

  it("weights by quantity", () => {
    // 10 @ 5.000 + 30 @ 6.000 = 230.000 / 40 = 5.750
    expect(applyMovement({ onHand: 10, avgCost: 5000 }, { delta: 30, unitCost: 6000 })).toEqual({ onHand: 40, avgCost: 5750 });
  });

  it("rounds half up to whole rupiah", () => {
    // 1 @ 1000 + 2 @ 1001 = 3002 / 3 = 1000.67 → 1001
    expect(applyMovement({ onHand: 1, avgCost: 1000 }, { delta: 2, unitCost: 1001 }).avgCost).toBe(1001);
  });

  it("sales don't change the average; stock may go negative", () => {
    expect(applyMovement({ onHand: 2, avgCost: 5000 }, { delta: -5 })).toEqual({ onHand: -3, avgCost: 5000 });
  });

  it("receiving while negative takes the incoming cost", () => {
    expect(applyMovement({ onHand: -3, avgCost: 5000 }, { delta: 10, unitCost: 7000 })).toEqual({ onHand: 7, avgCost: 7000 });
  });

  it("revaluation overrides the average without changing quantity", () => {
    expect(applyMovement({ onHand: 4, avgCost: 5000 }, { delta: 0, revalueTo: 6500 })).toEqual({ onHand: 4, avgCost: 6500 });
  });

  it("handles big numbers exactly (BigInt intermediate)", () => {
    const state = applyMovement({ onHand: 900_000, avgCost: 9_000_000_000 }, { delta: 100_000, unitCost: 9_000_000_010 });
    expect(state.avgCost).toBe(9_000_000_001);
  });

  it("property: on-hand always equals the sum of deltas (1.000 random sequences)", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let run = 0; run < 1000; run++) {
      let state: StockLevelState = { onHand: 0, avgCost: null };
      let sum = 0;
      const steps = 1 + Math.floor(random() * 30);
      for (let i = 0; i < steps; i++) {
        const delta = Math.floor(random() * 41) - 20;
        const unitCost = random() < 0.5 ? Math.floor(random() * 100_000) : null;
        state = applyMovement(state, { delta, unitCost });
        sum += delta;
        expect(state.onHand).toBe(sum);
        if (state.avgCost !== null) {
          expect(Number.isInteger(state.avgCost)).toBe(true);
          expect(state.avgCost).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("stockStatus", () => {
  it.each([
    [0, null, "kritis"],
    [-2, 10, "kritis"],
    [5, 2, "kritis"],
    [5, 6, "menipis"],
    [50, 30, "aman"],
    [2, null, "menipis"],
    [20, null, "aman"],
  ] as const)("onHand=%s daysLeft=%s → %s", (onHand, daysLeft, expected) => {
    expect(stockStatus(onHand, daysLeft)).toBe(expected);
  });
});
