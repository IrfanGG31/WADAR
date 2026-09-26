import { describe, expect, it } from "vitest";
import { missingFields } from "./quality.js";

describe("missingFields (PRD F3.9)", () => {
  it("flags missing cost, photo and zero price", () => {
    expect(
      missingFields({ photoPath: null, variants: [{ price: 0, cost: null, archived: false }] }),
    ).toEqual(["cost", "photo", "price"]);
  });

  it("is empty for a complete product", () => {
    expect(missingFields({ photoPath: "t/p/1.jpg", variants: [{ price: 10_000, cost: 6_000, archived: false }] })).toEqual([]);
  });

  it("ignores archived variants", () => {
    expect(
      missingFields({
        photoPath: "x",
        variants: [
          { price: 10_000, cost: 6_000, archived: false },
          { price: 0, cost: null, archived: true },
        ],
      }),
    ).toEqual([]);
  });
});
