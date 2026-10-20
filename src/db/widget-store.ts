import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryEmbedder } from "@/ai/query-embedding";
import { fetchAllRows } from "@/db/paginate";
import { layeredAnswerStore, memoryAnswerStore } from "@/core/answer-cache";
import type { TurnOutcome } from "@/core/chat/pipeline";
import { searchTerms, type KbCandidate } from "@/core/chat/retrieval";
import type { HistoryTurn, ProductCard } from "@/core/chat/schema";
import { parsePersona, parsePolicies } from "@/core/chat/store-policies";
import { sharedRateLimiter } from "@/db/rate-limit";
import { RATE_LIMIT_WINDOW_MS, SESSION_WINDOW_MS } from "@/core/chat/widget";
import type { PublicMessage, WidgetStore } from "@/core/chat/widget-service";
import { tableAnswerStore } from "@/db/answer-cache";
import { findOpenShop } from "@/db/open-shop";
import { notifyEscalation } from "@/core/notify";
import { supabaseNotifyDeps } from "@/db/notifications";
import { vapidConfigFromEnv } from "@/lib/web-push";
import { dispatchWebhooks } from "./webhooks";

const MESSAGE_COLUMNS = "id, author, content, created_at";

/** Per-instance layer in front of `ai_answer_cache` (keys carry the tenant). */
const answerMemory = memoryAnswerStore();
/** A row pulled from the shared table is kept locally only briefly. */
const WARM_TTL_MS = 5 * 60 * 1000;

/**
 * Service-role implementation of `WidgetStore`: the only reader is the customer-safe view + KB RPC.
 * `embedQuery` adds the vector side of the KB search; without it (or when it yields null) the
 * search is keyword-only.
 */
export function supabaseWidgetStore(db: SupabaseClient, { embedQuery }: { embedQuery?: QueryEmbedder } = {}): WidgetStore {
  return {
    answers: (tenantId) => layeredAnswerStore(answerMemory, tableAnswerStore(db, tenantId), WARM_TTL_MS),

    async findShop(slug) {
      const tenant = await findOpenShop(db, slug);
      if (!tenant) return null;
      const [{ data: profile, error: pe }, { data: agent }] = await Promise.all([
        db.from("store_profile").select("policies, persona").eq("tenant_id", tenant.id).maybeSingle(),
        db.from("agent_settings").select("auto_reply").eq("tenant_id", tenant.id).maybeSingle(),
      ]);
      if (pe) throw pe;
      return {
        tenantId: tenant.id as string,
        name: tenant.name as string,
        persona: parsePersona(profile?.persona ?? {}),
        policies: parsePolicies(profile?.policies ?? {}),
        autoReply: agent ? Boolean(agent.auto_reply) : true,
      };
    },

    async ensureConversation(tenantId, sessionId, channel = "widget", connector) {
      // Connector columns only when set: they come with migration channel_connectors.
      const link = connector
        ? { connection_id: connector.connectionId, ...(connector.displayName ? { display_name: connector.displayName.slice(0, 80) } : {}) }
        : {};
      const row = { tenant_id: tenantId, channel, external_user_id: sessionId, ...link };
      const { data, error } = await db
        .from("conversations")
        .upsert(row, { onConflict: "tenant_id,channel,external_user_id" })
        .select("id, mode, status, last_inbound_at")
        .single();
      if (error) throw error;
      return { id: data.id, mode: data.mode, status: data.status, lastInboundAt: data.last_inbound_at };
    },

    hitRateLimit(buckets, nowMs) {
      return sharedRateLimiter(db, RATE_LIMIT_WINDOW_MS).hit(buckets, nowMs);
    },

    async insertInbound({ tenantId, conversationId, providerMessageId, text }) {
      const { data, error } = await db
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          direction: "in",
          author: "customer",
          content: text,
          provider_message_id: providerMessageId,
        })
        .select(MESSAGE_COLUMNS)
        .single();
      if (error) {
        if (error.code === "23505") return null;
        throw error;
      }
      return data as PublicMessage;
    },

    async touchInbound({ tenantId, conversationId, nowIso, newWindow }) {
      const expires = new Date(Date.parse(nowIso) + SESSION_WINDOW_MS).toISOString();
      const { error } = await db
        .from("conversations")
        .update({ last_inbound_at: nowIso, window_expires_at: expires })
        .eq("id", conversationId);
      if (error) throw error;
      if (newWindow) {
        const { error: se } = await db
          .from("chat_sessions")
          .insert({ tenant_id: tenantId, conversation_id: conversationId, window_started_at: nowIso });
        if (se && se.code !== "23505") throw se;
      }
    },

    async loadTurnData({ tenantId, conversationId, text, before }) {
      // Embedding runs alongside the catalog read; it never fails the turn (null = keyword only).
      const embedding = embedQuery ? embedQuery(text) : Promise.resolve(null);
      const cards = await fetchAllRows<ProductCard>((from, to) =>
        db
          .from("chat_product_cards")
          .select("variant_id, name, option_label, category, description, price, availability, qty_hint")
          .eq("tenant_id", tenantId)
          .order("variant_id")
          .range(from, to),
      );
      const vector = await embedding;
      const { data: kb, error: ke } = await db.rpc("chat_kb_candidates", {
        p_tenant_id: tenantId,
        p_terms: searchTerms(text),
        p_embedding: vector ? JSON.stringify(vector) : null,
      });
      if (ke) throw ke;
      const kbCandidates: KbCandidate[] = ((kb ?? []) as Record<string, unknown>[])
        .filter((r) => r.kind !== "catalog")
        .map((r) => {
          const meta = (r.metadata ?? {}) as { question?: string; answer?: string };
          const base = { id: r.id as string, kind: r.kind === "faq" ? ("faq" as const) : ("doc" as const), content: r.content as string };
          return {
            ...base,
            ...(r.kind === "faq" ? { question: meta.question, answer: meta.answer } : {}),
            vec_rank: (r.vec_rank as number | null) ?? null,
            txt_rank: (r.txt_rank as number | null) ?? null,
          };
        });
      const { data: hist, error: he } = await db
        .from("messages")
        .select("author, content, created_at")
        .eq("conversation_id", conversationId)
        .lt("created_at", before)
        .order("created_at", { ascending: false })
        .limit(6);
      if (he) throw he;
      const history: HistoryTurn[] = (hist ?? [])
        .reverse()
        .map((m) => ({ author: m.author as HistoryTurn["author"], content: (m.content as string | null) ?? "" }));
      return { cards, kbCandidates, history };
    },

    async saveOutcome({ shop, conversationId, outcome }: Parameters<WidgetStore["saveOutcome"]>[0]) {
      if (outcome.action === "store_only") return [];
      let runId: string | null = null;
      for (const a of outcome.attempts) {
        const { data, error } = await db
          .from("ai_runs")
          .insert({
            tenant_id: shop.tenantId,
            feature: "customer_chat",
            model: a.model,
            input_tokens: a.meter?.inputTokens ?? 0,
            cached_tokens: a.meter?.cachedTokens ?? 0,
            output_tokens: a.meter?.outputTokens ?? 0,
            cost_idr: a.meter?.costIdr ?? "0",
            latency_ms: a.meter?.latencyMs ?? null,
            // Violations only — the rejected draft itself is never persisted for the buyer to see.
            guardrail: a.guard ? { verdict: a.guard.verdict, violations: a.guard.violations, unsafe: a.guard.unsafe } : null,
            error: a.error,
          })
          .select("id")
          .single();
        if (error) throw error;
        runId = data.id as string;
      }
      const isReply = outcome.action === "reply";
      const { data, error } = await db
        .from("messages")
        .insert({
          tenant_id: shop.tenantId,
          conversation_id: conversationId,
          direction: "out",
          author: isReply ? "ai" : "system",
          content: outcome.text,
          ai_run_id: runId,
          meta: isReply
            ? { engine: outcome.engine, ...(outcome.cached ? { cached: true } : {}) }
            : { cause: outcome.cause, unsafe: outcome.unsafe, pre_route: outcome.preRoute },
        })
        .select(MESSAGE_COLUMNS)
        .single();
      if (error) throw error;
      if (outcome.action === "escalate") {
        const { error: ce } = await db
          .from("conversations")
          .update({ mode: "human", status: "escalated", escalation_reason: outcome.cause })
          .eq("id", conversationId);
        if (ce) throw ce;
      }
      return [data as PublicMessage];
    },

    // After the response: the buyer's holding message is not delayed by DB writes or push services.
    async notifyEscalation(args) {
      after(() =>
        notifyEscalation(supabaseNotifyDeps(db, vapidConfigFromEnv()), args).catch((e: unknown) => {
          console.error("escalation notification failed", e);
        }),
      );
      // chat.needs_owner webhook (ADR-007), written by the escalation itself.
      after(() =>
        dispatchWebhooks(db, args.tenantId).catch((e: unknown) => {
          console.error("webhook dispatch failed", e);
        }),
      );
    },
  };
}

export type { TurnOutcome };
