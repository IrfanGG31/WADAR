import { describe, expect, it } from "vitest";
import { makeData, TODAY } from "./fixture";
import {
  callTool,
  deltaPct,
  explainProfitChange,
  getBusinessSnapshot,
  getCustomerStats,
  getPreferences,
  getProfitBreakdown,
  getReorderSuggestions,
  getSalesSummary,
  getSlowMovers,
  getStockStatus,
  listInsights,
  resolvePeriod,
  TOOL_NAMES,
} from "./tools";

const data = makeData();

describe("resolvePeriod", () => {
  it("builds same-length previous windows", () => {
    expect(resolvePeriod("7d", TODAY)).toMatchObject({ window: { from: "2026-10-09", to: "2026-10-15" }, previous: { from: "2026-10-02", to: "2026-10-08" } });
    expect(resolvePeriod("today", TODAY).previous).toEqual({ from: "2026-10-14", to: "2026-10-14" });
    expect(resolvePeriod("this_month", TODAY).window).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(resolvePeriod("last_month", TODAY).window).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod({ from: "2026-10-01", to: "2026-10-03" }, TODAY).previous).toEqual({ from: "2026-09-28", to: "2026-09-30" });
  });
});

describe("deltaPct", () => {
  it("is one decimal and null without a previous value", () => {
    expect(deltaPct(2_027_800, 1_735_000)).toBe(16.9);
    expect(deltaPct(897_560, 924_900)).toBe(-3);
    expect(deltaPct(5, 0)).toBeNull();
  });
});

describe("get_business_snapshot", () => {
  const s = getBusinessSnapshot(data);
  it("today and 7-day numbers with deltas already computed", () => {
    expect(s.sales_today).toEqual({ R: 120_000, q: 2, GP: 70_000 });
    expect(s.last_7_days.R).toEqual({ value: 2_027_800, prev: 1_735_000, delta: 292_800, delta_pct: 16.9 });
    expect(s.last_7_days.GP).toMatchObject({ value: 897_560, prev: 924_900, delta: -27_340, delta_pct: -3 });
    expect(s.last_7_days.NP).toMatchObject({ value: 647_560, prev: 724_900, delta: -77_340, delta_pct: -10.7 });
    expect(s.last_7_days.expenses).toBe(250_000);
  });
  it("lists critical stock, fee warning and open chats", () => {
    expect(s.critical_stock).toEqual([expect.objectContaining({ title: "Serum Vit C", status: "kritis", reorder_qty: 40, stockout_in_days: 3 })]);
    expect(s.margin_warnings.map((w) => w.code)).toEqual(["FEE_HEAVY"]);
    expect(s.open_escalated_chats).toBe(2);
  });
  it("fits the ~600-token snapshot budget (≤ 1.800 characters)", () => {
    expect(JSON.stringify(s).length).toBeLessThanOrEqual(1_800);
  });
});

describe("get_sales_summary", () => {
  it("groups by product with deltas against the previous period", () => {
    const r = getSalesSummary(data, { period: "7d", group_by: "product" });
    expect(r.total).toEqual({ R: 2_027_800, R_prev: 1_735_000, R_delta: 292_800, R_delta_pct: 16.9 });
    expect(r.rows[0]).toMatchObject({ label: "Serum Vit C", q: 20, R: 1_619_800, R_prev: 1_335_000, R_delta: 284_800 });
    expect(r.rows.map((x) => x.label)).toEqual(["Serum Vit C", "Toner", "Hair Mist"]);
  });
  it("groups by channel, category and day", () => {
    expect(getSalesSummary(data, { group_by: "channel" }).rows.map((x) => [x.label, x.R])).toEqual([
      ["Toko Offline (POS)", 1_120_000],
      ["TikTok Shop", 907_800],
    ]);
    expect(getSalesSummary(data, { group_by: "category" }).rows.map((x) => x.label)).toEqual(["Serum", "Toner", "Rambut"]);
    expect(getSalesSummary(data, { period: "today", group_by: "day" }).rows).toEqual([expect.objectContaining({ label: TODAY, R: 120_000 })]);
  });
});

describe("get_profit_breakdown", () => {
  it("totals and per-channel GP/margin", () => {
    const r = getProfitBreakdown(data, { period: "7d", by: "channel" });
    expect(r.totals).toMatchObject({ R: 2_027_800, C: 938_000, F: 192_240, GP: 897_560, expenses: 250_000, NP: 647_560 });
    expect(r.rows.map((x) => [x.label, x.R, x.GP, x.margin_pct])).toEqual([
      ["Toko Offline (POS)", 1_120_000, 638_000, 56.96],
      ["TikTok Shop", 907_800, 259_560, 28.59],
    ]);
    expect(r.thinnest).toBe("TikTok Shop");
    expect(r.change).toMatchObject({ GP_delta: -27_340, GP_delta_pct: -3, NP_delta: -77_340, NP_delta_pct: -10.7 });
  });
});

describe("explain_profit_change", () => {
  const r = explainProfitChange(data, { period_a: { from: "2026-10-02", to: "2026-10-08" }, period_b: "7d" });
  it("uses the §7.2 decomposition: effects add up to the change", () => {
    expect(r.comparable).toBe(true);
    expect([r.np_before, r.np_after, r.delta, r.delta_pct]).toEqual([724_900, 647_560, -77_340, -10.7]);
    expect(r.effects.reduce((s, e) => s + e.amount, 0)).toBe(-77_340);
    expect(Math.abs(r.effects[0].amount)).toBeGreaterThanOrEqual(Math.abs(r.effects[r.effects.length - 1].amount));
  });
  it("names the biggest product and channel movers", () => {
    expect(r.top_channel?.label).toBeTruthy();
    expect(r.top_product?.label).toBeTruthy();
  });
  it("defaults period_a to the period right before period_b", () => {
    expect(explainProfitChange(data, {}).delta).toBe(-77_340);
  });
});

describe("stock tools", () => {
  it("get_stock_status counts and filters", () => {
    const r = getStockStatus(data, { status: "kritis" });
    expect(r.counts).toEqual({ habis: 0, kritis: 1, menipis: 0, aman: 2 });
    expect(r.rows.map((x) => x.title)).toEqual(["Serum Vit C"]);
    expect(getStockStatus(data, { query: "toner" }).rows).toHaveLength(1);
  });
  it("get_reorder_suggestions", () => {
    expect(getReorderSuggestions(data)).toMatchObject({ count: 1, rows: [{ title: "Serum Vit C", reorder_qty: 40 }] });
  });
  it("get_slow_movers with idle capital", () => {
    expect(getSlowMovers(data)).toMatchObject({ count: 1, total_idle_capital: 1_200_000, rows: [{ title: "Hair Mist" }] });
  });
});

describe("get_customer_stats", () => {
  it("new, returning, top and lapsed (default 60 days)", () => {
    const r = getCustomerStats(data, { period: "30d" });
    expect(r.new_customers).toBe(1);
    expect(r.returning_customers).toBe(1);
    expect(r.top_customers.map((c) => [c.name, c.total_spent])).toEqual([["Sari Dewi", 3_000_000], ["Tono", 2_000_000], ["Budi", 1_500_000], ["Rina", 800_000]]);
    expect(r.lapsed_top_customers.map((c) => [c.name, c.days_since_last_order])).toEqual([["Tono", 75]]);
  });
  it("idle_days 30 adds Sari Dewi (43 days)", () => {
    expect(getCustomerStats(data, { idle_days: 30 }).lapsed_top_customers.map((c) => c.name)).toEqual(["Sari Dewi", "Tono"]);
  });
});

describe("insights and preferences", () => {
  it("list_insights filters by status", () => {
    const d = makeData({
      insights: [
        { type: "slow_mover", title: "A", body: "a", severity: 2, dedupe_key: "k1", status: "new", created_day: TODAY, period_start: null },
        { type: "slow_mover", title: "B", body: "b", severity: 1, dedupe_key: "k2", status: "dismissed", created_day: TODAY, period_start: null },
      ],
    });
    expect(listInsights(d).count).toBe(1);
    expect(listInsights(d, { status: "dismissed" }).rows[0].title).toBe("B");
  });
  it("get_preferences returns pinned memory", () => {
    expect(getPreferences(data)).toEqual({ count: 1, rows: [{ kind: "preference", content: "Jangan pernah diskon di atas 15%" }] });
  });
});

describe("registry", () => {
  it("every named tool is callable and returns JSON-serialisable data", () => {
    for (const name of TOOL_NAMES) {
      const out = callTool(name, {}, data);
      expect(() => JSON.stringify(out)).not.toThrow();
    }
  });
  it("returns the same numbers on a repeat call (pure)", () => {
    expect(callTool("get_business_snapshot", {}, data)).toEqual(callTool("get_business_snapshot", {}, data));
  });
});
