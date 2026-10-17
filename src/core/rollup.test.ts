import { describe, expect, it } from "vitest";
import { rollupWindow, runDailyRollup, type RollupDeps } from "./rollup";

// 17.30 UTC on 17 Oct = 00.30 WIB / 01.30 WITA / 02.30 WIT on 18 Oct (the cron's slot).
const CRON_RUN = new Date("2026-10-17T17:30:00Z");

describe("rollupWindow", () => {
  it("covers the last N closed days in the shop's own timezone, never today", () => {
    expect(rollupWindow(CRON_RUN, "Asia/Jakarta", 2)).toEqual({ from: "2026-10-16", to: "2026-10-17" });
    expect(rollupWindow(CRON_RUN, "Asia/Jayapura", 1)).toEqual({ from: "2026-10-17", to: "2026-10-17" });
    // Still 17 Oct in UTC: yesterday there is 16 Oct.
    expect(rollupWindow(CRON_RUN, "UTC", 1)).toEqual({ from: "2026-10-16", to: "2026-10-16" });
  });

  it("clamps the day count to 1…31", () => {
    expect(rollupWindow(CRON_RUN, "Asia/Jakarta", 0)).toEqual({ from: "2026-10-17", to: "2026-10-17" });
    expect(rollupWindow(CRON_RUN, "Asia/Jakarta", 400).from).toBe("2026-09-17");
  });
});

function fakeDeps(fail: string[] = []) {
  const calls: { tenantId: string; from: string; to: string }[] = [];
  const deps: RollupDeps = {
    listShops: async () => [
      { id: "t-jkt", timezone: "Asia/Jakarta" },
      { id: "t-bad", timezone: "Asia/Jakarta" },
      { id: "t-jpr", timezone: "Asia/Jayapura" },
    ],
    rollup: async (tenantId, window) => {
      calls.push({ tenantId, ...window });
      if (fail.includes(tenantId)) throw { message: "boom" };
      return { fin_rows: 3, stock_rows: 4 };
    },
  };
  return { deps, calls };
}

describe("runDailyRollup", () => {
  it("rolls up every shop over its own window and totals the rows", async () => {
    const { deps, calls } = fakeDeps();
    const r = await runDailyRollup(deps, CRON_RUN, 2);
    expect(calls).toEqual([
      { tenantId: "t-jkt", from: "2026-10-16", to: "2026-10-17" },
      { tenantId: "t-bad", from: "2026-10-16", to: "2026-10-17" },
      { tenantId: "t-jpr", from: "2026-10-16", to: "2026-10-17" },
    ]);
    expect(r).toEqual({ ran_at: CRON_RUN.toISOString(), days: 2, shops: 3, fin_rows: 9, stock_rows: 12, errors: [] });
  });

  it("a failing shop is reported and does not stop the others", async () => {
    const { deps, calls } = fakeDeps(["t-bad"]);
    const r = await runDailyRollup(deps, CRON_RUN, 1);
    expect(calls.map((c) => c.tenantId)).toEqual(["t-jkt", "t-bad", "t-jpr"]);
    expect(r).toMatchObject({ shops: 2, fin_rows: 6, stock_rows: 8, errors: [{ tenant_id: "t-bad", error: "boom" }] });
  });

  it("running twice asks for exactly the same windows (the SQL side replaces, never adds)", async () => {
    const { deps, calls } = fakeDeps();
    await runDailyRollup(deps, CRON_RUN, 2);
    const first = [...calls];
    calls.length = 0;
    await runDailyRollup(deps, CRON_RUN, 2);
    expect(calls).toEqual(first);
  });

  it("a failed shop list is a job error, not a crash", async () => {
    const r = await runDailyRollup({ listShops: async () => Promise.reject(new Error("db down")), rollup: async () => ({ fin_rows: 0, stock_rows: 0 }) }, CRON_RUN, 2);
    expect(r).toMatchObject({ shops: 0, errors: [{ tenant_id: null, error: "db down" }] });
  });
});
