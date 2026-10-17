import { describe, expect, it } from "vitest";
import { ProductInput, StockInInput } from "./catalog-schema";

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

describe("StockInInput — tanggal kedaluwarsa (STK-5)", () => {
  const base = { variant_id: "21000000-0000-4000-8000-000000000002", qty: 5, unit_cost: 35000 };

  it("is optional; empty means no date", () => {
    expect(StockInInput.parse(base).expires_on).toBeNull();
    expect(StockInInput.parse({ ...base, expires_on: "" }).expires_on).toBeNull();
    expect(StockInInput.parse({ ...base, expires_on: null }).expires_on).toBeNull();
    expect(StockInInput.parse({ ...base, expires_on: "2027-03-01" }).expires_on).toBe("2027-03-01");
  });

  it("rejects other formats", () => {
    const r = StockInInput.safeParse({ ...base, expires_on: "01/03/2027" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Tanggal kedaluwarsa belum benar.");
  });
});
