import { describe, expect, it } from "vitest";
import { levelStatus } from "./stock-level";

describe("levelStatus", () => {
  it("habis at zero or below", () => {
    expect(levelStatus(0, 5)).toBe("habis");
    expect(levelStatus(-2, 0)).toBe("habis");
  });
  it("menipis at or under the minimum", () => {
    expect(levelStatus(5, 5)).toBe("menipis");
    expect(levelStatus(1, 5)).toBe("menipis");
  });
  it("aman above the minimum", () => {
    expect(levelStatus(6, 5)).toBe("aman");
    expect(levelStatus(1, 0)).toBe("aman");
  });
});
