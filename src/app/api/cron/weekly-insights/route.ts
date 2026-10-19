import { after } from "next/server";
import { consultFor } from "@/ai";
import { loadCustomAi } from "@/db/ai-provider";
import { notConfiguredDelivery, runWeeklyInsightJob } from "@/core/consult/weekly-job";
import { buildDigestContent, digestExists, listDigestShops, markDigestDelivery, saveDigest } from "@/db/weekly-digest";
import { rejectCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/weekly-insights — Vercel Cron (vercel.json, Monday 00.00 UTC = 07.00 WIB).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the env var the job never runs.
 * Stores one digest per shop per week (GAP #5); safe to call again — finished shops are skipped.
 * Batches: one call handles at most WEEKLY_BATCH_SIZE shops (default 20, ordered by id) so it
 * stays under maxDuration; when shops remain, it calls itself with `?after=<next_cursor>`
 * after the response. A lost link only delays the rest: calling with that cursor resumes it.
 * Delivery (email / WhatsApp) is a not-configured hook for now.
 */
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 20;

function batchSize(): number {
  const n = Number(process.env.WEEKLY_BATCH_SIZE);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_BATCH_SIZE;
}

export async function GET(request: Request): Promise<Response> {
  const rejected = rejectCronRequest(request);
  if (rejected) return rejected;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("after")?.slice(0, 64) || null;
  const db = createAdminClient();
  const report = await runWeeklyInsightJob(
    {
      listShops: () => listDigestShops(db),
      hasDigest: (tenantId, weekStart) => digestExists(db, tenantId, weekStart),
      build: async (shop, today) =>
        buildDigestContent(db, consultFor(await loadCustomAi(shop.id)), { is_demo: false, business_type: null, ...shop }, today),
      save: (d) => saveDigest(db, d),
      deliver: notConfiguredDelivery,
      markDelivery: (tenantId, weekStart, outcome) => markDigestDelivery(db, tenantId, weekStart, outcome),
    },
    new Date(),
    { batchSize: batchSize(), after: cursor },
  );
  for (const r of report.results) if (r.status === "failed") console.error("[weekly] shop failed", r.slug, r.error);

  if (report.next_cursor) {
    const next = new URL(url.pathname, url.origin);
    next.searchParams.set("after", report.next_cursor);
    const authorization = request.headers.get("authorization") ?? "";
    // Only the hand-off is awaited (the next batch runs in its own invocation).
    after(() =>
      fetch(next.toString(), { headers: { authorization }, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch((e) =>
        console.error("[weekly] next batch not started", report.next_cursor, e instanceof Error ? e.name : e),
      ),
    );
  }
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
