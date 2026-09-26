import { describe, expect, it } from "vitest";
import { formatRupiah, formatRupiahCompact } from "./money.js";

describe("formatRupiah", () => {
  it("formats zero", () => {
    expect(formatRupiah(0n)).toBe("Rp0");
  });

  it("formats with thousand separators", () => {
    expect(formatRupiah(1_250_000n)).toBe("Rp1.250.000");
  });

  it("formats large bigint amounts without precision loss", () => {
    expect(formatRupiah(999_999_999_999n)).toBe("Rp999.999.999.999");
  });

  it("never renders a decimal fraction", () => {
    expect(formatRupiah(1_000n)).not.toContain(",");
  });

  it("accepts plain numbers (API JSON) and negatives", () => {
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
