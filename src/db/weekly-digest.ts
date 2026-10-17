import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Consult } from "@/ai";
import { narrateInsights } from "@/core/consult/insights";
import type { DeliveryOutcome, DigestContent, WeeklyDigest } from "@/core/consult/weekly-job";
import { createClient } from "@/lib/supabase/server";
import { tableAnswerStore } from "./answer-cache";
import { getWeeklyInsights, loadConsultData, recordConsultRuns } from "./consult";
import type { Shop } from "./shop";

/** Weekly insight digests (GAP #5): one row per shop per week, written by the cron or the owner's button. */

const TABLE = "weekly_insight_digests";

/**
 * Shops the cron runs for: every shop not scheduled for deletion. `select("*")` so the job
 * still runs on a database without the deletion columns (migration 20261017024527).
 */
export async function listDigestShops(db: SupabaseClient): Promise<Shop[]> {
  const { data, error } = await db.from("tenants").select("*").order("id");
  if (error) throw error;
  return ((data ?? []) as (Shop & { deletion_requested_at?: string | null })[])
    .filter((t) => !t.deletion_requested_at)
    .map(({ id, name, slug, timezone, is_demo, business_type }) => ({ id, name, slug, timezone, is_demo, business_type }));
}

export async function digestExists(db: SupabaseClient, tenantId: string, weekStart: string): Promise<boolean> {
  const { data, error } = await db.from(TABLE).select("id").eq("tenant_id", tenantId).eq("week_start", weekStart).maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Insert-if-absent on (tenant_id, week_start); true only when this call inserted the row. */
export async function saveDigest(db: SupabaseClient, digest: WeeklyDigest): Promise<boolean> {
  const { data, error } = await db
    .from(TABLE)
    .upsert({ ...digest }, { onConflict: "tenant_id,week_start", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/** Server-only (service role): owners have no UPDATE grant on the digest table. */
export async function markDigestDelivery(db: SupabaseClient, tenantId: string, weekStart: string, outcome: DeliveryOutcome): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({
      delivery_status: outcome.status,
      delivery_error: outcome.status === "failed" ? outcome.error.slice(0, 300) : null,
      delivered_at: outcome.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("tenant_id", tenantId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

export type StoredDigest = WeeklyDigest & { created_at: string };

/** This week's stored digest for Beranda; null when none yet or the table isn't there (migration not applied). */
export async function getWeeklyDigest(tenantId: string, weekStart: string, db?: SupabaseClient): Promise<StoredDigest | null> {
  const supabase = db ?? (await createClient());
  const { data, error } = await supabase
    .from(TABLE)
    .select("tenant_id, week_start, text, points, insight_keys, engine, model, source, generated_by, created_at")
    .eq("tenant_id", tenantId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) {
    // 42P01 / PGRST205: table not created yet — expected until the migration is applied.
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error("weekly digest read failed", error);
    return null;
  }
  return (data as StoredDigest | null) ?? null;
}

/**
 * The week's insights (stored in `insights`) + narration, with `db` for every read and write:
 * the cron passes the service-role client, the button the owner's. Numbers come from the
 * loaders and src/core; the model (if any) only narrates, grounded, else the template.
 */
export async function buildDigestContent(db: SupabaseClient, consult: Pick<Consult, "narrateWeekly">, shop: Shop, today: string): Promise<DigestContent> {
  const data = await loadConsultData(shop, today, { db });
  const weekly = await getWeeklyInsights(shop, data, { persist: true, db });
  const narration = await consult.narrateWeekly(weekly.selected, data, undefined, { cacheScope: shop.id, store: tableAnswerStore(db, shop.id) });
  await recordConsultRuns(shop.id, { attempts: narration.attempts, source: narration.source, tierReason: "weekly", fallbackReason: narration.fallbackReason }, db).catch(
    (e) => console.error("[weekly] ai_runs", e),
  );
  return {
    text: narration.text,
    points: narrateInsights(weekly.selected).points,
    insight_keys: weekly.selected.map((c) => c.dedupe_key),
    engine: narration.engine,
    model: narration.model,
    source: narration.source,
  };
}
