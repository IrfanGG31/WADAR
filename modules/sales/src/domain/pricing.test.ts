import { describe, expect, it } from "vitest";
import { PricingError, allocate, cashChange, priceOrder } from "./pricing.js";

const line = (variantId: string, qty: number, unitPrice: number, lineDiscount = 0, unitCost = 0) => ({
  variantId,
  qty,
  unitPrice,
  lineDiscount,
  unitCost,
});

describe("allocate", () => {
  it("always sums exactly to the total", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10_000, [30_000, 20_000, 50_000])).toEqual([3_000, 2_000, 5_000]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
  });

  it("property: sum invariant over random inputs", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed % n;
    };
    for (let i = 0; i < 2000; i++) {
      const weights = Array.from({ length: 1 + rnd(8) }, () => rnd(1_000_000));
      const total = rnd(5_000_000);
      const parts = allocate(total, weights);
      const sum = parts.reduce((a, b) => a + b, 0);
      expect(sum).toBe(weights.every((w) => w === 0) ? 0 : total);
      parts.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    }
  });
});

describe("priceOrder", () => {
  it("applies line + order discounts and spreads the order discount by value", () => {
    const priced = priceOrder([line("a", 2, 50_000, 10_000, 30_000), line("b", 1, 30_000, 0, 12_000)], 12_000, 0);
    // after line discounts: a=90.000, b=30.000 → order discount 12.000 split 9.000/3.000
    expect(priced.lines.map((l) => [l.discount, l.netAmount])).toEqual([
      [19_000, 81_000],
      [3_000, 27_000],
    ]);
    expect(priced).toMatchObject({ gross: 130_000, discount: 22_000, net: 108_000, cost: 72_000, commission: 0 });
  });

  it("computes channel commission on the net and allocates it", () => {
    const priced = priceOrder([line("a", 1, 100_000), line("b", 1, 50_000)], 0, 250); // 2,5%
    expect(priced.commission).toBe(3_750);
    expect(priced.lines.map((l) => l.commission)).toEqual([2_500, 1_250]);
  });

  it("rejects discounts bigger than the price", () => {
    expect(() => priceOrder([line("a", 1, 10_000, 10_001)], 0, 0)).toThrow(PricingError);
    expect(() => priceOrder([line("a", 1, 10_000)], 10_001, 0)).toThrow(PricingError);
  });

  it("a 3-item cash sale gives the right change", () => {
    const priced = priceOrder([line("a", 1, 25_000), line("b", 2, 15_000), line("c", 1, 8_500)], 0, 0);
    expect(priced.net).toBe(63_500);
    expect(cashChange(priced.net, 100_000)).toBe(36_500);
  });
});
