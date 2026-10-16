import "server-only";
import type { ConsultAttempt, ConsultOutcome } from "@/ai/consult";
import { narrateInsights, selectInsights, recentKeys, weekStart, weeklyCandidates, type InsightCandidate, type Urgency } from "@/core/consult/insights";
import type { RememberIntent } from "@/core/consult/question";
import type {
  ConsultData,
  CustomerRow,
  InsightRecord,
  InsightStatus,
  MemoryItem,
} from "@/core/consult/tools";
import { addDays, isoDateInZone, lastDays, startOfDayUtc } from "@/core/period";
import { createClient } from "@/lib/supabase/server";
import { listCustomers } from "./customers";
import { getFinanceData } from "./finance";
import type { Shop } from "./shop";
import { listStockForecasts } from "./stock";

/** Days of fin_daily loaded: enough for "bulan lalu" against the month before it. */
export const CONSULT_HISTORY_DAYS = 90;

type Db = Awaited<ReturnType<typeof createClient>>;

/** Owner's saved notes for the prompt: pinned first, then newest — the cap drops the oldest, not the latest. */
export function memoryQuery(supabase: Db, tenantId: string) {
  return supabase
    .from("memory_items")
    .select("id, kind, content, pinned")
    .eq("tenant_id", tenantId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
}

/** Everything the Konsultasi tools read, loaded as the signed-in owner (RLS applies). */
export async function loadConsultData(shop: Shop, today: string, opts: { historyDays?: number } = {}): Promise<ConsultData> {
  const supabase = await createClient();
  const localDay = (iso: string) => isoDateInZone(new Date(iso), shop.timezone);

  const [finance, stock, customers, memory, insights, escalated] = await Promise.all([
    getFinanceData(shop.id, lastDays(today, opts.historyDays ?? CONSULT_HISTORY_DAYS)),
    listStockForecasts(shop.id),
    listCustomers(shop),
    memoryQuery(supabase, shop.id),
    supabase
      .from("insights")
      .select("type, title, body, severity, dedupe_key, status, period_start, created_at")
      .eq("tenant_id", shop.id)
      .gte("created_at", `${addDays(today, -30)}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", shop.id).eq("status", "escalated"),
  ]);
  if (memory.error) throw memory.error;
  if (insights.error) throw insights.error;

  return {
    today,
    lines: finance.lines,
    expenses: finance.expenses,
    stock,
    customers: customers.map(
      (c): CustomerRow => ({
        id: c.id,
        name: c.name,
        total_spent: c.total_spent,
        orders_count: c.orders_count,
        first_day: c.first_day,
        last_order_day: c.last_order_day,
      }),
    ),
    insights: (insights.data ?? []).map(
      (i): InsightRecord => ({
        type: i.type as string,
        title: i.title as string,
        body: i.body as string,
        severity: Number(i.severity),
        dedupe_key: i.dedupe_key as string,
        status: i.status as InsightStatus,
        created_day: localDay(i.created_at as string),
        period_start: (i.period_start as string | null) ?? null,
      }),
    ),
    memory: (memory.data ?? []).map((m): MemoryItem => ({ id: m.id as string, kind: m.kind as MemoryItem["kind"], content: m.content as string, pinned: Boolean(m.pinned) })),
    escalatedChats: escalated.count ?? 0,
  };
}

/** Consult calls this month that actually reached a model (offline answers don't count against the deep quota). */
export async function consultUsageThisMonth(tenantId: string, today: string, timeZone = "Asia/Jakarta"): Promise<{ total: number; deep: number }> {
  const supabase = await createClient();
  // The 1st of the month at the shop's midnight (WIB 00.00 = 17.00 UTC the day before).
  const since = startOfDayUtc(`${today.slice(0, 7)}-01`, timeZone);
  const count = async (feature: string) => {
    const { count: n, error } = await supabase
      .from("ai_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("feature", feature)
      .not("model", "like", "offline%")
      .gte("created_at", since);
    if (error) throw error;
    return n ?? 0;
  };
  const [fast, deep] = await Promise.all([count("consult_fast"), count("consult_deep")]);
  return { total: fast + deep, deep };
}

/** One ai_runs row per model attempt (tokens + cost from src/ai/meter.ts); grounding verdict in `guardrail`. */
export async function recordConsultRuns(tenantId: string, outcome: Pick<ConsultOutcome, "attempts" | "source" | "tierReason" | "fallbackReason">): Promise<void> {
  if (outcome.attempts.length === 0) return;
  const supabase = await createClient();
  const rows = outcome.attempts.map((a: ConsultAttempt) => ({
    tenant_id: tenantId,
    feature: a.tier,
    model: a.model,
    input_tokens: a.meter?.inputTokens ?? 0,
    cached_tokens: a.meter?.cachedTokens ?? 0,
    output_tokens: a.meter?.outputTokens ?? 0,
    cost_idr: a.meter?.costIdr ?? "0",
    latency_ms: a.meter?.latencyMs ?? null,
    guardrail: {
      grounding: { rejected: a.rejected.map((c) => c.text), source: outcome.source },
      tier_reason: outcome.tierReason,
      fallback_reason: outcome.fallbackReason,
    },
    error: a.error,
  }));
  const { error } = await supabase.from("ai_runs").insert(rows);
  if (error) throw error;
}

/** `remember` — the one write the consult path makes, after the owner confirmed it. */
export async function saveMemory(tenantId: string, intent: RememberIntent): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memory_items")
    .insert({ tenant_id: tenantId, kind: intent.kind, content: intent.content, source: "consult", pinned: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface WeeklyInsights {
  weekStart: string;
  selected: InsightCandidate[];
  /** True when read back from `insights` (or just saved); false for a computed preview. */
  saved: boolean;
}

/**
 * This week's top-3. Stored rows of the current week win (so the button and
 * Beranda agree); otherwise candidates are generated, deduped against the
 * last 7 days and — when `persist` — stored.
 */
export async function getWeeklyInsights(shop: Shop, data: ConsultData, opts: { persist: boolean }): Promise<WeeklyInsights> {
  const ws = weekStart(data.today);
  const stored = data.insights.filter((i) => i.period_start === ws);
  if (stored.length > 0) {
    const selected = stored
      .map((i): InsightCandidate => {
        const urgency = Math.min(3, Math.max(1, i.severity)) as Urgency;
        return { type: i.type as InsightCandidate["type"], urgency, impact: 0, score: 0, title: i.title, text: i.body, dedupe_key: i.dedupe_key, evidence: {} };
      })
      .sort((a, b) => b.urgency - a.urgency);
    return { weekStart: ws, selected, saved: true };
  }
  const selected = selectInsights(weeklyCandidates(data), recentKeys(data.insights, data.today, ws));
  if (opts.persist && selected.length > 0) {
    const supabase = await createClient();
    const { error } = await supabase.from("insights").upsert(
      selected.map((c) => ({
        tenant_id: shop.id,
        engine: "consult",
        type: c.type,
        severity: c.urgency,
        title: c.title,
        body: c.text,
        evidence: { ...c.evidence, impact: c.impact, score: c.score },
        dedupe_key: c.dedupe_key,
        period_start: ws,
      })),
      { onConflict: "tenant_id,dedupe_key,period_start", ignoreDuplicates: true },
    );
    if (error) throw error;
    return { weekStart: ws, selected, saved: true };
  }
  return { weekStart: ws, selected, saved: false };
}

export { narrateInsights };
