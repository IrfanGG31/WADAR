import { z } from "zod";
import { getConsult } from "@/ai";
import type { ConsultEvent } from "@/ai/consult";
import { narrateInsights } from "@/core/consult/insights";
import { detectRemember } from "@/core/consult/question";
import { consultUsageThisMonth, getWeeklyInsights, loadConsultData, recordConsultRuns, saveMemory } from "@/db/consult";
import { tableAnswerStore } from "@/db/answer-cache";
import { saveDigest } from "@/db/weekly-digest";
import { permissionDenied } from "@/db/access";
import { findShop } from "@/db/shop";
import { isoDateInZone } from "@/core/period";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/consult (TECH-SPEC §5, §7.4) — owner-only, NDJSON stream:
 *   {type:"status"} … {type:"delta"} … {type:"final", …}
 * `delta` lines are the model's UNVERIFIED draft; the `final` line is what was
 * grounded (or the template that replaced it) and always replaces the draft.
 * Actions: ask (default) · remember (saves a confirmed "ingat ya…") · weekly.
 */
/** Two drafts (draft + one regeneration) with tool steps must fit before the platform cuts the stream. */
export const maxDuration = 60;

const Turn = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1500) });
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ask"),
    slug: z.string().min(1).max(80),
    question: z.string().trim().min(2).max(600),
    history: z.array(Turn).max(8).default([]),
    deep: z.boolean().default(false),
  }),
  z.object({ action: z.literal("remember"), slug: z.string().min(1).max(80), content: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("weekly"), slug: z.string().min(1).max(80) }),
]);

const HEADERS = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" };

function ndjson(run: (emit: (e: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await run(emit);
      } catch (e) {
        console.error("[consult]", e);
        emit({ type: "error", text: "Konsultan sedang bermasalah. Coba lagi sebentar lagi." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  const body = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Silakan masuk dulu." }, { status: 401 });
  // RLS only returns the shop to its members.
  const shop = await findShop(body.slug);
  if (!shop) return Response.json({ error: "Toko tidak ditemukan." }, { status: 404 });
  const denied = await permissionDenied(shop.id, "consult");
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const today = isoDateInZone(new Date(), shop.timezone);
  const consult = getConsult();

  if (body.action === "remember") {
    const intent = detectRemember(body.content) ?? { kind: "fact" as const, content: body.content };
    return ndjson(async (emit) => {
      await saveMemory(shop.id, intent);
      emit({ type: "remembered", content: intent.content });
    });
  }

  if (body.action === "weekly") {
    return ndjson(async (emit) => {
      emit({ type: "status", text: "Menyusun insight minggu ini…" });
      const data = await loadConsultData(shop, today);
      const weekly = await getWeeklyInsights(shop, data, { persist: true });
      const narration = await consult.narrateWeekly(weekly.selected, data, undefined, {
        cacheScope: shop.id,
        store: tableAnswerStore(supabase, shop.id),
      });
      await recordConsultRuns(shop.id, { attempts: narration.attempts, source: narration.source, tierReason: "weekly", fallbackReason: narration.fallbackReason });
      const points = narrateInsights(weekly.selected).points;
      // Same row the Monday job writes (GAP #5); a digest already stored this week is kept.
      await saveDigest(supabase, {
        tenant_id: shop.id,
        week_start: weekly.weekStart,
        text: narration.text,
        points,
        insight_keys: weekly.selected.map((c) => c.dedupe_key),
        engine: narration.engine,
        model: narration.model,
        source: narration.source,
        generated_by: "manual",
      }).catch((e) => console.error("[consult] weekly digest", e));
      emit({
        type: "weekly",
        text: narration.text,
        points,
        engine: narration.engine,
        model: narration.model,
        fallbackReason: narration.fallbackReason,
        grounding: narration.source,
        cached: narration.cached ?? false,
      });
    });
  }

  return ndjson(async (emit) => {
    emit({ type: "status", text: "Memikirkan pertanyaanmu…" });
    const [data, usage] = await Promise.all([loadConsultData(shop, today), consultUsageThisMonth(shop.id, today, shop.timezone)]);
    const outcome = await consult.ask(
      { question: body.question, history: body.history, data, deepRequested: body.deep, usage, cacheScope: shop.id },
      (e: ConsultEvent) => emit(e),
    );
    await recordConsultRuns(shop.id, outcome).catch((e) => console.error("[consult] ai_runs", e));
    emit({
      type: "final",
      kind: outcome.kind,
      text: outcome.text,
      remember: outcome.remember,
      engine: outcome.engine,
      model: outcome.model,
      tier: outcome.tier,
      tierReason: outcome.tierReason,
      grounding: outcome.source,
      fallbackReason: outcome.fallbackReason,
      toolsUsed: outcome.toolsUsed,
      cached: outcome.cached ?? false,
    });
  });
}

