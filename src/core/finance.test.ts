import { describe, expect, it } from "vitest";
import {
  aggregateByProduct,
  decomposeProfitChange,
  discountHeavyPeriod,
  feeHeavyChannels,
  marginWarnings,
  sellBelowCostLines,
  totalsByChannel,
  totalsByVariant,
  totalsOverLines,
  type SaleItemLine,
} from "./finance";

function line(partial: Partial<SaleItemLine> = {}): SaleItemLine {
  return {
    variant_id: "V1",
    product_name: "Produk",
    channel_id: "C1",
    channel_name: "POS",
    qty: 1,
    unit_price: 10_000,
    line_discount: 0,
    unit_cost: 6_000,
    cost_is_set: true,
    alloc_order_discount: 0,
    alloc_platform_fee: 0,
    alloc_shipping_subsidy: 0,
    ...partial,
  };
}

describe("totalsOverLines", () => {
  it("computes R, C, F, S, GP and margin from raw lines", () => {
    const t = totalsOverLines([
      line({ qty: 2, unit_price: 10_000, unit_cost: 6_000, alloc_platform_fee: 500 }),
      line({ qty: 1, unit_price: 20_000, line_discount: 2_000, unit_cost: 12_000 }),
    ]);
    expect(t.q).toBe(3);
    expect(t.revenue_gross).toBe(40_000);
    expect(t.R).toBe(40_000 - 2_000); // 38_000
    expect(t.C).toBe(2 * 6_000 + 12_000); // 24_000
    expect(t.F).toBe(500);
    expect(t.GP).toBe(38_000 - 24_000 - 500);
    expect(t.margin_pct).toBeCloseTo((t.GP / t.R) * 100, 2);
  });

  it("segregates cost_known revenue so items with HPP 0 don't fake-inflate margin", () => {
    const t = totalsOverLines([
      line({ unit_cost: 0, cost_is_set: false, qty: 1, unit_price: 10_000 }),
      line({ unit_cost: 6_000, cost_is_set: true, qty: 1, unit_price: 10_000 }),
    ]);
    expect(t.cost_known_R).toBe(10_000);
    expect(t.cost_known_GP).toBe(4_000);
    expect(t.cost_known_margin_pct).toBe(40);
  });

  it("groups by variant and channel", () => {
    const lines = [
      line({ variant_id: "A", channel_id: "C1", qty: 2 }),
      line({ variant_id: "B", channel_id: "C1", qty: 1, unit_price: 50_000, unit_cost: 20_000 }),
      line({ variant_id: "A", channel_id: "C2", qty: 1 }),
    ];
    const byV = totalsByVariant(lines);
    const byC = totalsByChannel(lines);
    expect(byV.map((g) => g.key).sort()).toEqual(["A", "B"]);
    expect(byC.find((g) => g.key === "C1")?.totals.q).toBe(3);
    expect(byC.find((g) => g.key === "C2")?.totals.q).toBe(1);
  });
});

describe("decomposeProfitChange", () => {
  it("invariant: Σ effects = NP1 − NP0 (continuing products + expense)", () => {
    const p0 = aggregateByProduct([
      line({ variant_id: "A", qty: 10, unit_price: 10_000, unit_cost: 6_000 }),
      line({ variant_id: "B", qty: 4, unit_price: 20_000, unit_cost: 12_000, alloc_platform_fee: 2_000 }),
    ]);
    const p1 = aggregateByProduct([
      line({ variant_id: "A", qty: 15, unit_price: 11_000, unit_cost: 6_500, line_discount: 3_000 }),
      line({ variant_id: "B", qty: 2, unit_price: 20_000, unit_cost: 13_000, alloc_platform_fee: 1_000 }),
    ]);
    const result = decomposeProfitChange(p0, p1, 50_000, 75_000);
    const sum =
      result.effects.volume +
      result.effects.price +
      result.effects.discount +
      result.effects.cogs +
      result.effects.fee +
      result.effects.shipping +
      result.effects.new_products +
      result.effects.stopped_products +
      result.effects.expense;
    expect(sum).toBe(result.delta);
    expect(result.delta).toBe(result.np1 - result.np0);
  });

  it("invariant: still exact when products enter and exit between periods", () => {
    const p0 = aggregateByProduct([
      line({ variant_id: "A", qty: 10, unit_price: 10_000, unit_cost: 6_000 }),
      line({ variant_id: "GONE", qty: 3, unit_price: 15_000, unit_cost: 8_000 }),
    ]);
    const p1 = aggregateByProduct([
      line({ variant_id: "A", qty: 8, unit_price: 10_500, unit_cost: 6_200 }),
      line({ variant_id: "NEW", qty: 5, unit_price: 25_000, unit_cost: 15_000, alloc_platform_fee: 1_000 }),
    ]);
    const result = decomposeProfitChange(p0, p1, 20_000, 20_000);
    const sum =
      result.effects.volume +
      result.effects.price +
      result.effects.discount +
      result.effects.cogs +
      result.effects.fee +
      result.effects.shipping +
      result.effects.new_products +
      result.effects.stopped_products +
      result.effects.expense;
    expect(sum).toBe(result.delta);
    // NEW adds, GONE subtracts
    expect(result.effects.new_products).toBeGreaterThan(0);
    expect(result.effects.stopped_products).toBeLessThan(0);
  });

  it("invariant: empty inputs on both sides collapse to Δ = −(E1 − E0)", () => {
    const result = decomposeProfitChange([], [], 0, 10_000);
    expect(result.delta).toBe(-10_000);
    expect(result.effects.expense).toBe(-10_000);
  });

  it("ranks by_product by absolute ΔGP so the biggest mover is first", () => {
    const p0 = aggregateByProduct([
      line({ variant_id: "A", qty: 10, unit_price: 10_000, unit_cost: 6_000 }),
      line({ variant_id: "B", qty: 5, unit_price: 10_000, unit_cost: 6_000 }),
    ]);
    const p1 = aggregateByProduct([
      line({ variant_id: "A", qty: 10, unit_price: 10_000, unit_cost: 6_000 }),
      line({ variant_id: "B", qty: 20, unit_price: 10_000, unit_cost: 6_000 }),
    ]);
    const r = decomposeProfitChange(p0, p1, 0, 0);
    expect(r.by_product[0].variant_id).toBe("B");
  });
});

describe("margin warnings (FIN-6)", () => {
  it("SELL_BELOW_COST fires per variant when net rev < cost", () => {
    const w = sellBelowCostLines([
      line({
        variant_id: "V1",
        qty: 2,
        unit_price: 10_000,
        unit_cost: 6_000,
        alloc_platform_fee: 9_000,
      }),
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("SELL_BELOW_COST");
    expect(w[0].severity).toBe(3);
    expect(w[0].stats.loss).toBeGreaterThan(0);
  });

  it("SELL_BELOW_COST ignores items with cost_is_set = false", () => {
    const w = sellBelowCostLines([
      line({ cost_is_set: false, unit_cost: 0, alloc_platform_fee: 9_999 }),
    ]);
    expect(w).toEqual([]);
  });

  it("FEE_HEAVY fires per channel when F / R > 20%", () => {
    const w = feeHeavyChannels([
      line({ channel_id: "SHOPEE", channel_name: "Shopee", qty: 1, unit_price: 10_000, alloc_platform_fee: 3_000 }),
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("FEE_HEAVY");
    expect(w[0].key).toBe("SHOPEE");
  });

  it("FEE_HEAVY stays silent when the fee is exactly on the threshold", () => {
    const w = feeHeavyChannels([
      line({ channel_id: "C1", qty: 1, unit_price: 10_000, alloc_platform_fee: 2_000 }),
    ]);
    expect(w).toEqual([]);
  });

  it("DISCOUNT_HEAVY fires when total discount > 15% of gross", () => {
    const w = discountHeavyPeriod([
      line({ qty: 1, unit_price: 10_000, line_discount: 2_000 }),
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("DISCOUNT_HEAVY");
  });

  it("DISCOUNT_HEAVY stays silent at or below 15%", () => {
    const w = discountHeavyPeriod([line({ qty: 1, unit_price: 10_000, line_discount: 1_500 })]);
    expect(w).toEqual([]);
  });

  it("marginWarnings sorts severe → mild", () => {
    const w = marginWarnings([
      line({ qty: 1, unit_price: 10_000, line_discount: 6_000 }), // DISCOUNT_HEAVY once summed over all gross
      line({ channel_id: "SHOPEE", qty: 1, unit_price: 10_000, alloc_platform_fee: 3_000 }), // FEE_HEAVY
      line({ variant_id: "V2", qty: 1, unit_price: 10_000, unit_cost: 20_000 }), // SELL_BELOW_COST
    ]);
    expect(w[0].severity).toBe(3);
    expect(w[w.length - 1].severity).toBe(1);
  });
});
