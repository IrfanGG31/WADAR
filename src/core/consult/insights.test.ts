import { describe, expect, it } from "vitest";
import { makeData, TODAY } from "./fixture";
import {
  narrateInsights,
  narrationText,
  recentKeys,
  scoreOf,
  selectInsights,
  weekStart,
  weeklyCandidates,
  type InsightCandidate,
} from "./insights";
import { checkGrounding, collectEvidence } from "./grounding";
import type { InsightRecord } from "./tools";

const data = makeData();

describe("scoreOf", () => {
  it("is impact × urgency (kritis 3, peringatan 2, info 1) and never negative", () => {
    expect(scoreOf(1_619_800, 3)).toBe(4_859_400);
    expect(scoreOf(1_200_000, 2)).toBe(2_400_000);
    expect(scoreOf(500_000, 1)).toBe(500_000);
    expect(scoreOf(-5, 3)).toBe(0);
  });
});

describe("weeklyCandidates", () => {
  const cands = weeklyCandidates(data);
  const byKey = new Map(cands.map((c) => [c.dedupe_key, c]));

  it("covers stock, slow mover, margin warning, profit effect and lapsed customers", () => {
    expect(new Set(cands.map((c) => c.type))).toEqual(
      new Set(["stock_critical", "slow_mover", "margin_warning", "profit_effect", "lapsed_customers"]),
    );
  });
  it("scores stock-out by the product's 7-day sales × 3", () => {
    const c = byKey.get("stock_critical:v-serum")!;
    expect(c).toMatchObject({ urgency: 3, impact: 1_619_800, score: 4_859_400 });
    expect(c.text).toContain("Rp1.619.800");
  });
  it("skips slow movers below Rp500 rb idle capital", () => {
    const d = makeData({ stock: data.stock.map((r) => (r.variant_id === "v-hair" ? { ...r, idle_capital: 499_999 } : r)) });
    expect(weeklyCandidates(d).some((c) => c.type === "slow_mover")).toBe(false);
  });
  it("margin warning impact is the fee amount", () => {
    expect(byKey.get("margin_warning:FEE_HEAVY:ch-tt")).toMatchObject({ urgency: 2, impact: 192_240, score: 384_480 });
  });
  it("margin drop vs last week is a margin warning worth the untung kotor it lost", () => {
    // Margin (HPP known) 53,31% → 44,26%: −9,05 poin × R 2.027.800 = 183.516.
    const c = byKey.get("margin_warning:MARGIN_DROP:period")!;
    expect(c).toMatchObject({ urgency: 2, impact: 183_516, title: "Margin tergerus" });
    expect(c.text).toMatch(/^Margin 7 hari terakhir turun 9,1 poin, dari 53,3% jadi 44,3% dibanding 7 hari sebelumnya\./);
  });
  it("sales without HPP get their own warning, not the discount sentence", () => {
    const extra = { ...data.lines[6], variant_id: "v-new", product_name: "Sabun", cost_is_set: false, cost_total: 0, unit_cost: 0 };
    const c = weeklyCandidates(makeData({ lines: [...data.lines, extra] })).find((x) => x.dedupe_key === "margin_warning:MISSING_COST:period")!;
    expect(c).toMatchObject({ title: "HPP belum diisi", urgency: 2, impact: 0 });
    expect(c.text).toContain("Sabun terjual Rp120.000 tanpa HPP");
    expect(c.text).not.toContain("Diskon");
  });
  it("flags lapsed top customers after 30 days with their typical order value", () => {
    // Sari Dewi: 3.000.000 / 12 = 250.000; Tono: 2.000.000 / 8 = 250.000
    expect(byKey.get("lapsed_customers")).toMatchObject({ urgency: 1, impact: 500_000, score: 500_000 });
  });
});

describe("selectInsights", () => {
  const cands = weeklyCandidates(data);

  it("returns the top-3 by score, highest first", () => {
    const top = selectInsights(cands, new Set());
    expect(top).toHaveLength(3);
    expect(top.map((c) => c.dedupe_key).slice(0, 2)).toEqual(["stock_critical:v-serum", "slow_mover:v-hair"]);
    const scores = top.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const rest = cands.filter((c) => !top.includes(c));
    expect(Math.max(...rest.map((c) => c.score))).toBeLessThanOrEqual(top[2].score);
  });

  it("drops what was shown in the last 7 days (dedupe) and promotes the next candidate", () => {
    const seen = new Set(["stock_critical:v-serum"]);
    const top = selectInsights(cands, seen);
    expect(top.map((c) => c.dedupe_key)).not.toContain("stock_critical:v-serum");
    expect(top[0].dedupe_key).toBe("slow_mover:v-hair");
    expect(top).toHaveLength(3);
  });

  it("breaks score ties by urgency, then key — deterministic", () => {
    const mk = (key: string, urgency: 1 | 2 | 3, impact: number): InsightCandidate => ({
      type: "slow_mover", urgency, impact, score: scoreOf(impact, urgency), title: key, text: key, dedupe_key: key, evidence: {},
    });
    const out = selectInsights([mk("b", 1, 600), mk("a", 2, 300), mk("c", 3, 200), mk("d", 1, 10)], new Set(), 3);
    expect(out.map((c) => c.dedupe_key)).toEqual(["c", "a", "b"]); // 600, 600, 600 → urgency 3, 2, 1
  });

  it("keeps one candidate per key", () => {
    const base = cands[0];
    expect(selectInsights([base, { ...base, score: base.score + 1 }], new Set())).toHaveLength(1);
  });
});

describe("recentKeys (7-day window)", () => {
  const rec = (dedupe_key: string, created_day: string, period_start: string | null = null): InsightRecord => ({
    type: "x", title: "t", body: "b", severity: 1, dedupe_key, status: "new", created_day, period_start,
  });
  it("includes days today-6…today only", () => {
    const keys = recentKeys([rec("in", "2026-10-09"), rec("out", "2026-10-08")], TODAY);
    expect([...keys]).toEqual(["in"]);
  });
  it("ignores the batch being regenerated (same period_start)", () => {
    const keys = recentKeys([rec("same-week", "2026-10-13", "2026-10-12"), rec("older", "2026-10-10", "2026-10-05")], TODAY, "2026-10-12");
    expect([...keys]).toEqual(["older"]);
  });
});

describe("weekStart", () => {
  it("is the Monday of the week", () => {
    expect(weekStart("2026-10-15")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
  });
});

describe("narration", () => {
  it("is 3 points + 1 summary sentence, and every number is grounded in the candidates", () => {
    const top = selectInsights(weeklyCandidates(data), new Set());
    const n = narrateInsights(top);
    expect(n.points).toHaveLength(3);
    expect(n.summary).toMatch(/^Ada 3 hal/);
    const text = narrationText(n);
    const evidence = collectEvidence(top.map((c) => ({ ...c.evidence, impact: c.impact })), top.map((c) => c.text), top.reduce((s, c) => s + c.impact, 0));
    expect(checkGrounding(text, evidence).ok).toBe(true);
  });
  it("says so when there is nothing", () => {
    expect(narrateInsights([]).points).toEqual([]);
  });
});
