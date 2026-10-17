import { createHash, timingSafeEqual } from "node:crypto";
import { getConsult } from "@/ai";
import { notConfiguredDelivery, runWeeklyInsightJob } from "@/core/consult/weekly-job";
import { buildDigestContent, digestExists, listDigestShops, markDigestDelivery, saveDigest } from "@/db/weekly-digest";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/weekly-insights — Vercel Cron (vercel.json, Monday 00.00 UTC = 07.00 WIB).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the env var the job never runs.
 * Stores one digest per shop per week (GAP #5); safe to call again — finished shops are skipped.
 * Delivery (email / WhatsApp) is a not-configured hook for now.
 */
export const maxDuration = 300;

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(request: Request, secret: string): boolean {
  const given = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET belum diatur." }, { status: 503 });
  if (!authorized(request, secret)) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });

  const db = createAdminClient();
  const consult = getConsult();
  const report = await runWeeklyInsightJob(
    {
      listShops: () => listDigestShops(db),
      hasDigest: (tenantId, weekStart) => digestExists(db, tenantId, weekStart),
      build: (shop, today) => buildDigestContent(db, consult, { is_demo: false, business_type: null, ...shop }, today),
      save: (d) => saveDigest(db, d),
      deliver: notConfiguredDelivery,
      markDelivery: (tenantId, weekStart, outcome) => markDigestDelivery(db, tenantId, weekStart, outcome),
    },
    new Date(),
  );
  for (const r of report.results) if (r.status === "failed") console.error("[weekly] shop failed", r.slug, r.error);
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
