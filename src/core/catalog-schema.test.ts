import { describe, expect, it } from "vitest";
import { ProductInput } from "./catalog-schema";

const variant = { option_label: "20 ml", sku: "SVC-20", price: 89000, cost: 35000 };

describe("ProductInput", () => {
  it("fills defaults", () => {
    const parsed = ProductInput.parse({ name: " Serum ", variants: [variant] });
    expect(parsed.name).toBe("Serum");
    expect(parsed.unit).toBe("pcs");
    expect(parsed.variants[0]).toMatchObject({ min_stock: 0, lead_time_days: 3, pack_size: 1 });
  });

  it("requires HPP but allows 0", () => {
    expect(ProductInput.safeParse({ name: "Serum", variants: [{ ...variant, cost: 0 }] }).success).toBe(true);
    const missing = ProductInput.safeParse({ name: "Serum", variants: [{ price: 1000 }] });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toMatch(/HPP wajib/);
  });

  it("rejects fractions, negatives and empty variants", () => {
    expect(ProductInput.safeParse({ name: "A", variants: [{ ...variant, price: 10.5 }] }).success).toBe(false);
    expect(ProductInput.safeParse({ name: "A", variants: [{ ...variant, cost: -1 }] }).success).toBe(false);
    expect(ProductInput.safeParse({ name: "A", variants: [] }).success).toBe(false);
    expect(ProductInput.safeParse({ name: "", variants: [variant] }).success).toBe(false);
  });
});
