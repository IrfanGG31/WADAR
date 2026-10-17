import { describe, expect, it, vi } from "vitest";
import { runDailyCleanup } from "./maintenance";

const NOW = new Date("2026-10-18T19:00:00Z");

describe("runDailyCleanup", () => {
  it("purges shops past their grace period and prunes expired answer-cache rows, as of `now`", async () => {
    const purgeDueShops = vi.fn(async () => 2);
    const pruneAnswerCache = vi.fn(async () => 15);
    const report = await runDailyCleanup({ purgeDueShops, pruneAnswerCache }, NOW);
    expect(report).toEqual({ ran_at: NOW.toISOString(), purged_shops: 2, pruned_cache_rows: 15, errors: [] });
    expect(pruneAnswerCache).toHaveBeenCalledWith(NOW);
  });

  it("is idempotent: a second run with nothing left due reports zeros", async () => {
    let due = 1;
    let expired = 3;
    const deps = {
      purgeDueShops: async () => [due, (due = 0)][0],
      pruneAnswerCache: async () => [expired, (expired = 0)][0],
    };
    await runDailyCleanup(deps, NOW);
    expect(await runDailyCleanup(deps, NOW)).toMatchObject({ purged_shops: 0, pruned_cache_rows: 0, errors: [] });
  });

  it("a failing step does not stop the other one", async () => {
    const report = await runDailyCleanup(
      { purgeDueShops: async () => Promise.reject(new Error("function purge_due_shops does not exist")), pruneAnswerCache: async () => 4 },
      NOW,
    );
    expect(report.purged_shops).toBeNull();
    expect(report.pruned_cache_rows).toBe(4);
    expect(report.errors).toEqual([{ step: "purge_due_shops", error: "function purge_due_shops does not exist" }]);
  });
});
