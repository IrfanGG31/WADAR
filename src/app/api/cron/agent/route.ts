import { runAgentForShop } from "@/db/agent";
import { listDigestShops } from "@/db/weekly-digest";
import { rejectCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * GET /api/cron/agent — Vercel Cron (vercel.json, 23.00 UTC = 06.00 WIB): one Autopilot pass per
 * shop (reorder drafts, FAQ suggestions, closing what is no longer needed). A failing shop is
 * logged and skipped; the rest still run.
 */
export async function GET(request: Request): Promise<Response> {
  const rejected = rejectCronRequest(request);
  if (rejected) return rejected;
  const db = createAdminClient();
  const shops = await listDigestShops(db);
  const report = { shops: shops.length, created: 0, closed: 0, errors: [] as { tenant_id: string; error: string }[] };
  for (const shop of shops) {
    try {
      const r = await runAgentForShop(db, shop.id);
      report.created += r.created;
      report.closed += r.closed;
    } catch (e) {
      report.errors.push({ tenant_id: shop.id, error: e instanceof Error ? e.message : String(e) });
      console.error("[agent] shop failed", shop.id, e);
    }
  }
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
