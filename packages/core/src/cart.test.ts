import { describe, expect, it } from "vitest";
import { cartItemCount, cartReducer, cartTotal, emptyCart, suggestCashAmounts } from "./cart.js";

const serum = { variantId: "a", name: "Serum", unitPrice: 89_000 };
const masker = { variantId: "b", name: "Masker", unitPrice: 15_000 };

describe("cartReducer", () => {
  it("adds, merges and totals", () => {
    let cart = cartReducer(emptyCart, { type: "add", item: serum });
    cart = cartReducer(cart, { type: "add", item: masker, qty: 3 });
    cart = cartReducer(cart, { type: "add", item: masker });
    expect(cartItemCount(cart)).toBe(5);
    expect(cartTotal(cart)).toBe(89_000 + 4 * 15_000);
  });

  it("clamps discounts to what's being discounted", () => {
    let cart = cartReducer(emptyCart, { type: "add", item: masker, qty: 2 });
    cart = cartReducer(cart, { type: "setLineDiscount", variantId: "b", discount: 99_000 });
    expect(cart.items[0]!.discount).toBe(30_000);
    cart = cartReducer(cart, { type: "setQty", variantId: "b", qty: 1 });
    expect(cart.items[0]!.discount).toBe(15_000);
    cart = cartReducer(cart, { type: "setLineDiscount", variantId: "b", discount: 0 });
    cart = cartReducer(cart, { type: "setOrderDiscount", discount: 1_000_000 });
    expect(cartTotal(cart)).toBe(0);
  });

  it("qty 0 removes the line; removing shrinks an order discount that no longer fits", () => {
    let cart = cartReducer(emptyCart, { type: "add", item: serum });
    cart = cartReducer(cart, { type: "add", item: masker });
    cart = cartReducer(cart, { type: "setOrderDiscount", discount: 50_000 });
    cart = cartReducer(cart, { type: "setQty", variantId: "a", qty: 0 });
    expect(cart.items.map((i) => i.variantId)).toEqual(["b"]);
    expect(cart.discount).toBe(15_000);
  });
});

describe("suggestCashAmounts", () => {
  it.each([
    [63_500, [63_500, 65_000, 70_000, 80_000]],
    [100_000, [100_000]],
    [255_000, [255_000, 260_000, 300_000]],
    [0, []],
  ])("%s → %j", (total, expected) => {
    expect(suggestCashAmounts(total)).toEqual(expected);
  });
});
