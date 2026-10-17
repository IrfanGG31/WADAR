/**
 * Daily housekeeping (Vercel Cron, src/app/api/cron/daily-cleanup):
 * - GAP #6: shops whose 7-day deletion grace period is over are purged (`purge_due_shops`).
 * - GAP #10: `ai_answer_cache` rows past `expires_at` are deleted (they are never read anyway).
 * Both steps only touch rows already due at `now`, so running the job again is a no-op.
 * A failing step is reported and does not stop the other one.
 */
export interface CleanupDeps {
  purgeDueShops(): Promise<number>;
  pruneAnswerCache(now: Date): Promise<number>;
}

export interface CleanupReport {
  ran_at: string;
  /** null = the step failed (see `errors`). */
  purged_shops: number | null;
  pruned_cache_rows: number | null;
  errors: { step: "purge_due_shops" | "prune_answer_cache"; error: string }[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e));

export async function runDailyCleanup(deps: CleanupDeps, now: Date): Promise<CleanupReport> {
  const errors: CleanupReport["errors"] = [];
  const step = async (name: CleanupReport["errors"][number]["step"], run: () => Promise<number>) => {
    try {
      return await run();
    } catch (e) {
      errors.push({ step: name, error: message(e) });
      return null;
    }
  };
  const purged_shops = await step("purge_due_shops", () => deps.purgeDueShops());
  const pruned_cache_rows = await step("prune_answer_cache", () => deps.pruneAnswerCache(now));
  return { ran_at: now.toISOString(), purged_shops, pruned_cache_rows, errors };
}
