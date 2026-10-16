import { describe, expect, it } from "vitest";
import {
  aggregateByProduct,
  decomposeProfitChange,
  discountHeavyPeriod,
  feeHeavyChannels,
  marginDrop,
  MARGIN_DROP_POINTS,
  marginWarnings,
  missingCost,
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

  it("warning messages use Indonesian decimals (21,5%, not 21.5%)", () => {
    const fee = feeHeavyChannels([line({ channel_id: "S", channel_name: "Shopee", qty: 1, unit_price: 10_000, alloc_platform_fee: 2_150 })]);
    expect(fee[0].message).toBe("Komisi Shopee 21,5% dari penjualan.");
    const disc = discountHeavyPeriod([line({ qty: 1, unit_price: 10_000, line_discount: 1_650 })]);
    expect(disc[0].message).toBe("Diskon 16,5% dari penjualan kotor.");
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

describe("FIN-6: MARGIN_DROP & MISSING_COST", () => {
  // margin = (price − cost) / price: 10.000 − 6.000 → 40%.
  const before = [line({ qty: 10, unit_price: 10_000, unit_cost: 6_000 })];

  it("MARGIN_DROP fires when margin falls 6 points (40% → 34%)", () => {
    const now = [line({ qty: 10, unit_price: 10_000, unit_cost: 6_600 })];
    const w = marginDrop(now, before);
    expect(MARGIN_DROP_POINTS).toBe(5);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ code: "MARGIN_DROP", scope: "period", severity: 2, cause: "cogs" });
    expect(w[0].stats).toMatchObject({ margin_before: 40, margin_now: 34, drop_pts: 6, days: 7, cause_before: 60, cause_now: 66 });
    // 6 poin dari penjualan bersih Rp100.000 → untung kotor berkurang ±Rp6.000.
    expect(w[0].stats.lost_gp).toBe(6_000);
  });

  it("MARGIN_DROP stays silent when margin falls only 3 points (40% → 37%)", () => {
    const now = [line({ qty: 10, unit_price: 10_000, unit_cost: 6_300 })];
    expect(marginDrop(now, before)).toEqual([]);
  });

  it("MARGIN_DROP fires at exactly 5 points and names the fee as the cause", () => {
    const now = [line({ qty: 10, unit_price: 10_000, unit_cost: 6_000, alloc_platform_fee: 5_000 })];
    const w = marginDrop(now, before);
    expect(w).toHaveLength(1);
    expect(w[0].cause).toBe("fee");
    expect(w[0].stats.drop_pts).toBe(5);
  });

  it("MARGIN_DROP needs HPP in both periods and ignores lines without HPP", () => {
    const now = [line({ qty: 10, unit_price: 10_000, unit_cost: 9_000 })];
    expect(marginDrop(now, [])).toEqual([]);
    expect(marginDrop([], before)).toEqual([]);
    // A no-HPP sale (would look like 100% margin) must not hide a real drop.
    const mixed = [...now, line({ variant_id: "V9", qty: 50, unit_price: 10_000, unit_cost: 0, cost_is_set: false })];
    expect(marginDrop(mixed, before)[0]?.stats.margin_now).toBe(10);
  });

  it("marginWarnings only checks MARGIN_DROP when the previous period is given", () => {
    const now = [line({ qty: 10, unit_price: 10_000, unit_cost: 6_600 })];
    expect(marginWarnings(now).map((w) => w.code)).not.toContain("MARGIN_DROP");
    const w = marginWarnings(now, { previous: before, days: 30 });
    expect(w.find((x) => x.code === "MARGIN_DROP")?.stats.days).toBe(30);
  });

  it("MISSING_COST lists sold variants without HPP", () => {
    const lines = [
      line({ variant_id: "A", product_name: "Masker", qty: 2, unit_price: 50_000, unit_cost: 0, cost_is_set: false }),
      line({ variant_id: "A", product_name: "Masker", qty: 1, unit_price: 50_000, unit_cost: 0, cost_is_set: false }),
      line({ variant_id: "B", product_name: "Sabun", qty: 1, unit_price: 20_000, unit_cost: 0, cost_is_set: false }),
      line({ variant_id: "C", product_name: "Serum", qty: 1, unit_price: 30_000 }),
    ];
    const w = missingCost(lines);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ code: "MISSING_COST", scope: "period", label: "Masker, Sabun" });
    expect(w[0].stats).toMatchObject({ variants: 2, qty: 4, R_missing: 170_000, R: 200_000 });
    expect(marginWarnings(lines).map((x) => x.code)).toContain("MISSING_COST");
  });

  it("MISSING_COST stays silent when every sold variant has HPP", () => {
    expect(missingCost([line()])).toEqual([]);
  });
});
