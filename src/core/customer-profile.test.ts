import { describe, expect, it } from "vitest";
import { CustomerProfileInput, favoriteProducts, parseTags } from "./customer-profile";

describe("parseTags (CRM-2)", () => {
  it("splits on commas/hashes, lowercases, and de-duplicates", () => {
    expect(parseTags("Reseller, langganan,  reseller\n#VIP")).toEqual(["reseller", "langganan", "vip"]);
    expect(parseTags(" , ")).toEqual([]);
  });
});

describe("CustomerProfileInput", () => {
  it("turns empty text into null and caps tags", () => {
    expect(CustomerProfileInput.parse({ name: " ", notes: "", tags: [] })).toEqual({ name: null, notes: null, tags: [] });
    expect(CustomerProfileInput.safeParse({ name: "", notes: "", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(false);
  });
});

describe("favoriteProducts", () => {
  it("ranks by quantity from completed sales only", () => {
    const sales = [
      { status: "completed", items: [{ name_snapshot: "Serum", qty: 1 }, { name_snapshot: "Toner", qty: 2 }] },
      { status: "completed", items: [{ name_snapshot: "Serum", qty: 2 }] },
      { status: "void", items: [{ name_snapshot: "Masker", qty: 9 }] },
    ];
    expect(favoriteProducts(sales)).toEqual([
      { name: "Serum", qty: 3, times: 2 },
      { name: "Toner", qty: 2, times: 1 },
    ]);
  });
});
