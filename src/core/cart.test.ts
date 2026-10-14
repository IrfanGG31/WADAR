import { describe, expect, it } from "vitest";
import { cartTotals, cashSuggestions, changeDue, estimatePlatformFee } from "./cart";

const POS = { feePct: 0, feeFixed: 0 };
const SHOPEE = { feePct: 12, feeFixed: 1250 };

describe("estimatePlatformFee", () => {
  it("matches the record_sale SQL test vector (12% × 225.000 + 1.250)", () => {
    expect(estimatePlatformFee(225_000, SHOPEE)).toBe(28_250);
  });
  it("rounds half away from zero like Postgres", () => {
    expect(estimatePlatformFee(1_005, { feePct: 15, feeFixed: 0 })).toBe(151); // 150.75
    expect(estimatePlatformFee(10, { feePct: 15, feeFixed: 0 })).toBe(2); // 1.5
    expect(estimatePlatformFee(1_000, { feePct: 12.345, feeFixed: 0 })).toBe(123); // 123.45
  });
  it("is 0 for channels without a fee", () => {
    expect(estimatePlatformFee(500_000, POS)).toBe(0);
  });
});

describe("cartTotals", () => {
  const lines = [
    { variantId: "a", qty: 2, unitPrice: 100_000 },
    { variantId: "b", qty: 1, unitPrice: 50_000 },
  ];
  it("totals a Shopee order with a voucher", () => {
    expect(cartTotals(lines, 25_000, SHOPEE)).toEqual({
      subtotal: 250_000,
      orderDiscount: 25_000,
      total: 225_000,
      platformFee: 28_250,
      net: 196_750,
      items: 3,
    });
  });
  it("caps the discount at the subtotal and ignores negatives", () => {
    expect(cartTotals(lines, 999_999, POS).total).toBe(0);
    expect(cartTotals(lines, -5, POS).orderDiscount).toBe(0);
  });
  it("subtracts line discounts", () => {
    expect(cartTotals([{ variantId: "a", qty: 3, unitPrice: 10_000, lineDiscount: 5_000 }], 0, POS).subtotal).toBe(25_000);
  });
});

describe("cash", () => {
  it("computes change only when enough is paid", () => {
    expect(changeDue(267_000, 300_000)).toBe(33_000);
    expect(changeDue(267_000, 267_000)).toBe(0);
    expect(changeDue(267_000, 200_000)).toBeNull();
    expect(changeDue(267_000, undefined)).toBeNull();
  });
  it("suggests exact amount and round notes", () => {
    expect(cashSuggestions(267_000)).toEqual([267_000, 270_000, 280_000, 300_000]);
    expect(cashSuggestions(50_000)).toEqual([50_000, 60_000, 100_000]);
  });
});
