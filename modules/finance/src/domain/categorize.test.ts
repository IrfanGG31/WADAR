import { describe, expect, it } from "vitest";
import { normalizeKeyword, suggestCategory } from "./categorize.js";

describe("suggestCategory (PRD F2.3)", () => {
  it.each([
    ["Token listrik bulan ini", "exp_utilities"],
    ["gaji Rina minggu 2", "exp_salary"],
    ["Ongkir JNE ke Bandung", "exp_shipping"],
    ["beli plastik kemasan", "exp_supplies"],
    ["Boost iklan IG", "exp_ads"],
    ["bensin motor", "exp_operational"],
    ["sumbangan RT", "exp_other"],
  ])("%s → %s", (note, category) => {
    expect(suggestCategory(note, new Map()).category).toBe(category);
  });

  it("learned store rules win over the dictionary", () => {
    const learned = new Map([["kopi", "exp_operational" as const]]);
    expect(suggestCategory("kopi 2 kg", learned)).toEqual({ category: "exp_operational", source: "rule" });
  });

  it("normalizeKeyword picks the first meaningful word", () => {
    expect(normalizeKeyword("2 kg Kopi arabika!")).toBe("kopi");
    expect(normalizeKeyword("12 34")).toBeUndefined();
  });
});
