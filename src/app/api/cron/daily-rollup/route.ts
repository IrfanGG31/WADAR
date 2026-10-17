import { DEFAULT_ROLLUP_DAYS, runDailyRollup } from "@/core/rollup";
import { listShopsForRollup, rollupShopDays } from "@/db/rollup";
import { rejectCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/daily-rollup — Vercel Cron (vercel.json, 17.30 UTC = 00.30 WIB).
 * Rebuilds `fin_daily_rollup` / `stock_daily_rollup` for each shop's last closed days
 * (default 2, so a late sale from the day before is picked up). `?days=N` (≤ 31) backfills.
 * Re-running replaces the same rows (see src/core/rollup.ts).
 */
export async function GET(request: Request): Promise<Response> {
  const rejected = rejectCronRequest(request);
  if (rejected) return rejected;

  const raw = new URL(request.url).searchParams.get("days");
  const days = raw && /^\d+$/.test(raw) ? Number(raw) : DEFAULT_ROLLUP_DAYS;
  const db = createAdminClient();
  const report = await runDailyRollup(
    { listShops: () => listShopsForRollup(db), rollup: (tenantId, window) => rollupShopDays(db, tenantId, window) },
    new Date(),
    days,
  );
  for (const e of report.errors) console.error("[rollup] shop failed", e.tenant_id, e.error);
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
