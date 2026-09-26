import { describe, expect, it } from "vitest";
import { moneyInSpeech, terbilang } from "./terbilang.js";

describe("terbilang — table (BUILD-PLAN M5 DoD: 0 … 999.999.999.999)", () => {
  it.each([
    [0, "nol"],
    [1, "satu"],
    [9, "sembilan"],
    [10, "sepuluh"],
    [11, "sebelas"],
    [12, "dua belas"],
    [19, "sembilan belas"],
    [20, "dua puluh"],
    [21, "dua puluh satu"],
    [99, "sembilan puluh sembilan"],
    [100, "seratus"],
    [101, "seratus satu"],
    [110, "seratus sepuluh"],
    [111, "seratus sebelas"],
    [115, "seratus lima belas"],
    [200, "dua ratus"],
    [999, "sembilan ratus sembilan puluh sembilan"],
    [1_000, "seribu"],
    [1_001, "seribu satu"],
    [1_100, "seribu seratus"],
    [2_000, "dua ribu"],
    [10_000, "sepuluh ribu"],
    [11_000, "sebelas ribu"],
    [50_000, "lima puluh ribu"],
    [100_000, "seratus ribu"],
    [125_000, "seratus dua puluh lima ribu"],
    [111_111, "seratus sebelas ribu seratus sebelas"],
    [999_999, "sembilan ratus sembilan puluh sembilan ribu sembilan ratus sembilan puluh sembilan"],
    [1_000_000, "satu juta"],
    [1_001_000, "satu juta seribu"],
    [1_250_000, "satu juta dua ratus lima puluh ribu"],
    [10_000_000, "sepuluh juta"],
    [100_000_000, "seratus juta"],
    [1_000_000_000, "satu miliar"],
    [2_000_000_001, "dua miliar satu"],
    [
      999_999_999_999,
      "sembilan ratus sembilan puluh sembilan miliar sembilan ratus sembilan puluh sembilan juta sembilan ratus sembilan puluh sembilan ribu sembilan ratus sembilan puluh sembilan",
    ],
    [1_000_000_000_000, "satu triliun"],
  ])("%d → %s", (n, words) => {
    expect(terbilang(n)).toBe(words);
  });

  it("never produces double spaces or 'satu ratus/ribu' over a sweep of values", () => {
    for (let n = 0; n <= 20_000; n += 7) {
      const words = terbilang(n);
      expect(words).not.toMatch(/\s{2}|satu ratus|^satu ribu| satu ribu/);
    }
    for (let n = 1; n < 1_000_000_000_000; n = n * 3 + 17) {
      expect(terbilang(n)).not.toMatch(/\s{2}|undefined/);
    }
  });

  it("rejects negatives, fractions and out-of-range", () => {
    expect(() => terbilang(-1)).toThrow(RangeError);
    expect(() => terbilang(1.5)).toThrow(RangeError);
    expect(() => terbilang(1e18)).toThrow(RangeError);
  });

  it("builds the money-in sentence", () => {
    expect(moneyInSpeech(50_000, "GoPay")).toBe("Uang masuk lima puluh ribu rupiah dari GoPay");
    expect(moneyInSpeech(1_000)).toBe("Uang masuk seribu rupiah");
  });
});
