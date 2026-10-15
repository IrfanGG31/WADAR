import { describe, expect, it } from "vitest";
import { allocateLargestRemainder, formatRupiah, formatRupiahCompact, formatSignedRupiah } from "./money";

describe("formatRupiah", () => {
  it("formats zero", () => {
    expect(formatRupiah(0n)).toBe("Rp0");
  });

  it("formats with thousand separators and no space after Rp", () => {
    expect(formatRupiah(1_250_000n)).toBe("Rp1.250.000");
  });

  it("formats large bigint amounts without precision loss", () => {
    expect(formatRupiah(999_999_999_999n)).toBe("Rp999.999.999.999");
  });

  it("accepts plain numbers and negatives", () => {
    expect(formatRupiah(1250000)).toBe("Rp1.250.000");
    expect(formatRupiah(-5000)).toBe("-Rp5.000");
  });

  it("compact form", () => {
    expect(formatRupiahCompact(1_250_000)).toBe("Rp1,3 jt");
    expect(formatRupiahCompact(850_000)).toBe("Rp850 rb");
    expect(formatRupiahCompact(2_500_000_000)).toBe("Rp2,5 M");
    expect(formatRupiahCompact(-12_000)).toBe("-Rp12 rb");
    expect(formatRupiahCompact(500)).toBe("Rp500");
  });
});

describe("allocateLargestRemainder", () => {
  const sum = (parts: bigint[]) => parts.reduce((s, p) => s + p, 0n);

  it("splits exactly when proportions divide evenly", () => {
    expect(allocateLargestRemainder(10_000n, [50_000n, 30_000n, 20_000n])).toEqual([5_000n, 3_000n, 2_000n]);
  });

  it("gives leftover rupiah to the largest remainders, ties to the earlier line", () => {
    expect(allocateLargestRemainder(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    // 1000 over 7/7/6 → 350 / 350 / 300 exactly; 1001 → leftover goes to the larger remainder
    expect(allocateLargestRemainder(1001n, [7n, 7n, 6n])).toEqual([351n, 350n, 300n]);
    // remainders 2/3, 2/3, 2/3 of a unit → all tie → first two lines get the 2 leftover rupiah
    expect(allocateLargestRemainder(5n, [1n, 1n, 1n])).toEqual([2n, 2n, 1n]);
  });

  it("prefers the larger remainder over the earlier index", () => {
    // 11 over 3/3/4 (Σ10): 3.3 / 3.3 / 4.4 → the 1 leftover rupiah goes to index 2
    expect(allocateLargestRemainder(11n, [3n, 3n, 4n])).toEqual([3n, 3n, 5n]);
  });

  it("always sums to the total and never goes negative", () => {
    const weights = [12_345n, 1n, 999_999n, 0n, 42n];
    for (const total of [0n, 1n, 7n, 1_000_003n, 987_654_321n]) {
      const parts = allocateLargestRemainder(total, weights);
      expect(sum(parts)).toBe(total);
      expect(parts.every((p) => p >= 0n)).toBe(true);
      expect(parts[3]).toBe(0n); // zero weight gets nothing
    }
  });

  it("splits a negative total as the negated split of its absolute value", () => {
    expect(allocateLargestRemainder(-100n, [1n, 1n, 1n])).toEqual([-34n, -33n, -33n]);
  });

  it("handles amounts beyond Number.MAX_SAFE_INTEGER", () => {
    const parts = allocateLargestRemainder(9_007_199_254_740_993n, [1n, 1n]);
    expect(sum(parts)).toBe(9_007_199_254_740_993n);
    expect(parts).toEqual([4_503_599_627_370_497n, 4_503_599_627_370_496n]);
  });

  it("rejects negative weights and a non-zero total over zero weights", () => {
    expect(() => allocateLargestRemainder(10n, [1n, -1n])).toThrow(RangeError);
    expect(() => allocateLargestRemainder(10n, [0n, 0n])).toThrow(RangeError);
    expect(allocateLargestRemainder(0n, [0n, 0n])).toEqual([0n, 0n]);
    expect(allocateLargestRemainder(0n, [])).toEqual([]);
  });
});

describe("formatSignedRupiah", () => {
  it("always shows the sign of a change", () => {
    expect(formatSignedRupiah(5_000)).toBe("+Rp5.000");
    expect(formatSignedRupiah(-1_250_000n)).toBe("\u2212Rp1.250.000");
    expect(formatSignedRupiah(0)).toBe("Rp0");
  });
});
