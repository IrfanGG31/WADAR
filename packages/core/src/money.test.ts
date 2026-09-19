import { describe, expect, it } from "vitest";
import { formatRupiah } from "./money.js";

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
});
