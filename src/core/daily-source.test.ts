import { describe, expect, it } from "vitest";
import { daysWithRows, mergeDailyRows, planDailySource } from "./daily-source";

const window = { from: "2026-10-10", to: "2026-10-16" };
const today = "2026-10-16";
const rolled = (...days: string[]) => new Set(days);

describe("planDailySource", () => {
  it("reads every closed rolled-up day from the rollup and only today live", () => {
    const plan = planDailySource(window, today, rolled("2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"));
    expect([...plan.rollupDays]).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(plan.live).toEqual([{ from: today, to: today }]);
  });

  it("falls back to live for days without rollup rows (cron not run yet / table missing)", () => {
    expect(planDailySource(window, today, rolled()).live).toEqual([window]);
    const plan = planDailySource(window, today, rolled("2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"));
    expect(plan.live).toEqual([{ from: "2026-10-14", to: "2026-10-16" }]);
  });

  it("never trusts a rollup row for today or later", () => {
    const plan = planDailySource(window, today, rolled("2026-10-15", "2026-10-16"));
    expect(plan.rollupDays.has("2026-10-16")).toBe(false);
    expect(plan.rollupDays.has("2026-10-15")).toBe(true);
  });

  it("keeps gaps as separate ranges, and collapses them past the limit", () => {
    const gaps = rolled("2026-10-11", "2026-10-13", "2026-10-15");
    expect(planDailySource(window, today, gaps, 5).live).toEqual([
      { from: "2026-10-10", to: "2026-10-10" },
      { from: "2026-10-12", to: "2026-10-12" },
      { from: "2026-10-14", to: "2026-10-14" },
      { from: "2026-10-16", to: "2026-10-16" },
    ]);
    expect(planDailySource(window, today, gaps, 3).live).toEqual([window]);
  });

  it("a window wholly in the past can be served by the rollup alone", () => {
    const past = { from: "2026-10-01", to: "2026-10-02" };
    expect(planDailySource(past, today, rolled("2026-10-01", "2026-10-02")).live).toEqual([]);
  });
});

describe("mergeDailyRows", () => {
  it("takes each day from exactly one source — the totals equal the live view's", () => {
    const live = [
      { day: "2026-10-14", q: 2 },
      { day: "2026-10-15", q: 3 },
      { day: "2026-10-16", q: 1 },
    ];
    const rollup = [
      { day: "2026-10-14", q: 2 },
      { day: "2026-10-15", q: 3 },
    ];
    const w = { from: "2026-10-14", to: "2026-10-16" };
    const plan = planDailySource(w, today, daysWithRows(rollup));
    const merged = mergeDailyRows(plan, w, rollup, live);
    expect(merged.reduce((s, r) => s + r.q, 0)).toBe(live.reduce((s, r) => s + r.q, 0));
    expect(merged.map((r) => r.day).sort()).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("drops live rows outside the window (a collapsed range can over-fetch) and rollup rows of live days", () => {
    const w = { from: "2026-10-15", to: "2026-10-16" };
    const plan = { rollupDays: new Set(["2026-10-15"]), live: [{ from: "2026-10-16", to: "2026-10-16" }] };
    const merged = mergeDailyRows(
      plan,
      w,
      [{ day: "2026-10-15" }, { day: "2026-10-16" }],
      [{ day: "2026-10-14" }, { day: "2026-10-15" }, { day: "2026-10-16" }],
    );
    expect(merged).toEqual([{ day: "2026-10-15" }, { day: "2026-10-16" }]);
  });
});
