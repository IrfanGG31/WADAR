import { runDailyCleanup } from "@/core/maintenance";
import { pruneExpiredAnswerCache, purgeDueShops, purgeStaleDemoShops } from "@/db/maintenance";
import { rejectCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/daily-cleanup — Vercel Cron (vercel.json, 19.00 UTC = 02.00 WIB).
 * Purges shops past their deletion grace period (GAP #6) plus visitor demo shops older than 7 days, and prunes expired
 * `ai_answer_cache` rows (GAP #10). Safe to call again: only rows already due are touched.
 */
export async function GET(request: Request): Promise<Response> {
  const rejected = rejectCronRequest(request);
  if (rejected) return rejected;

  const db = createAdminClient();
  const report = await runDailyCleanup(
    { purgeDueShops: async () => (await purgeDueShops(db)) + (await purgeStaleDemoShops(db)), pruneAnswerCache: (now) => pruneExpiredAnswerCache(db, now) },
    new Date(),
  );
  for (const e of report.errors) console.error("[cleanup] step failed", e.step, e.error);
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
