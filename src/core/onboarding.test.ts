import { describe, expect, it } from "vitest";
import { setupProgress, setupSteps } from "./onboarding";

const fresh = { products: 0, channelsOnDefaultFee: 2, policyFacts: 0, faqs: 0, sales: 0, expenses: 0 };

describe("setupSteps (ONB-2)", () => {
  it("starts with nothing done, products first", () => {
    const steps = setupSteps(fresh);
    expect(steps[0]?.key).toBe("produk");
    expect(setupProgress(steps)).toEqual({ done: 0, total: 6, complete: false });
  });

  it("ticks steps off from real data", () => {
    const steps = setupSteps({ ...fresh, products: 3, channelsOnDefaultFee: 0, policyFacts: 2, sales: 1 });
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(["produk", "kanal", "jual"]);
    expect(setupProgress(setupSteps({ products: 1, channelsOnDefaultFee: 0, policyFacts: 3, faqs: 1, sales: 1, expenses: 1 })).complete).toBe(true);
  });
});
