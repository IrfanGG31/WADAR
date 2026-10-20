import { DEFAULT_ROLLUP_DAYS, runDailyRollup } from "@/core/rollup";
import { listShopsForRollup, rollupShopDays } from "@/db/rollup";
import { isSchemaPending } from "@/db/schema-pending";
import { rejectCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * GET /api/cron/daily-rollup — Vercel Cron (vercel.json, 17.30 UTC = 00.30 WIB).
 * Rebuilds `fin_daily_rollup` / `stock_daily_rollup` for each shop's last closed days
 * (default 2, so a late sale from the day before is picked up). `?days=N` (≤ 31) backfills.
 * Re-running replaces the same rows (see src/core/rollup.ts). Then posts every shop's new documents
 * to the journal.
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

  // Jurnal (ADR-006): book yesterday's documents too, so Neraca opens instantly. Idempotent.
  const journal = { posted: 0, errors: 0, skipped: 0 };
  const deadline = Date.now() + 200_000; // leave room under maxDuration; the rest posts on the next run or page view
  for (const shop of await listShopsForRollup(db)) {
    if (Date.now() > deadline) {
      journal.skipped += 1;
      continue;
    }
    const { data, error } = await db.rpc("post_journal", { p_tenant_id: shop.id });
    if (isSchemaPending(error)) break;
    if (error) {
      journal.errors += 1;
      console.error("[journal] shop failed", shop.id, error.message);
    } else journal.posted += Number(data ?? 0);
  }
  return Response.json({ ...report, journal }, { headers: { "cache-control": "no-store" } });
}
