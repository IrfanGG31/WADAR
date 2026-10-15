import { describe, expect, it } from "vitest";
import { formatCount, formatDecimal, formatPercent } from "./number-format";

describe("number-format (id-ID)", () => {
  it("uses comma decimals and dot thousands", () => {
    expect(formatPercent(23.456)).toBe("23,5%");
    expect(formatPercent(20)).toBe("20%");
    expect(formatDecimal(2.44)).toBe("2,4");
    expect(formatCount(1234)).toBe("1.234");
  });
});
