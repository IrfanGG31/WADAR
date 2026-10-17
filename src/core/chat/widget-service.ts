import type { AnswerStore } from "../answer-cache";
import type { ChatContext } from "./context";
import { retrieveContext } from "./context";
import type { Generate, TurnOutcome } from "./pipeline";
import { runTurn } from "./pipeline";
import type { KbCandidate } from "./retrieval";
import type { HistoryTurn, ProductCard } from "./schema";
import type { StorePersona, StorePolicies } from "./store-policies";
import { widgetBuckets } from "@/core/rate-limit";
import type { RateLimitResult } from "./widget";
import { isValidSessionId, startsNewWindow, WidgetMessageInput } from "./widget";

/**
 * One inbound widget message, end to end (CHT-8): validate → rate limit
 * (session + IP + shop, before any write) → store → the same `runTurn` pipeline as every other channel → store the reply
 * → on escalation, notify the owner (GAP #7).
 * All I/O goes through `WidgetStore`, so the rules below are unit-tested
 * without a database (`src/db/widget-store.ts` is the Supabase implementation).
 */
export interface WidgetShop {
  tenantId: string;
  name: string;
  persona: StorePersona;
  policies: StorePolicies;
}

export interface ConversationRow {
  id: string;
  mode: "ai" | "human";
  status: "open" | "escalated" | "closed";
  lastInboundAt: string | null;
}

/** What a visitor may see of a stored message — no meta, no run ids. */
export interface PublicMessage {
  id: string;
  author: "customer" | "ai" | "human" | "system";
  content: string;
  created_at: string;
}

export interface TurnData {
  cards: ProductCard[];
  kbCandidates: KbCandidate[];
  history: HistoryTurn[];
}

export interface WidgetStore {
  findShop(slug: string): Promise<WidgetShop | null>;
  ensureConversation(tenantId: string, sessionId: string): Promise<ConversationRow>;
  /** Atomic check-and-record over all buckets (see `RateLimiter`). */
  hitRateLimit(buckets: ReturnType<typeof widgetBuckets>, nowMs: number): Promise<RateLimitResult>;
  /** null when this `providerMessageId` is already stored (retry / double tap). */
  insertInbound(args: { tenantId: string; conversationId: string; providerMessageId: string; text: string }): Promise<PublicMessage | null>;
  touchInbound(args: { tenantId: string; conversationId: string; nowIso: string; newWindow: boolean }): Promise<void>;
  loadTurnData(args: { tenantId: string; conversationId: string; text: string; before: string }): Promise<TurnData>;
  /** FAQ answer cache of one shop (PDF §C.1); without it every turn calls the model. */
  answers?(tenantId: string): AnswerStore;
  /** Stores ai_runs, the outgoing message and the escalation state; returns the visitor-visible messages. */
  saveOutcome(args: { shop: WidgetShop; conversationId: string; outcome: TurnOutcome }): Promise<PublicMessage[]>;
  /** GAP #7: tell the owner a chat was handed to them (in-app row + web push, per the shop's preferences). */
  notifyEscalation?(args: { tenantId: string; conversationId: string; cause: string }): Promise<void>;
}

export type WidgetResult =
  | { status: 200; body: { messages: PublicMessage[]; inbound?: PublicMessage; duplicate?: boolean; mode: "ai" | "human" } }
  | { status: 400 | 404 | 429; body: { error: string; retryAfterSeconds?: number } };

export interface WidgetRequest {
  slug: string;
  sessionId: string | null;
  /** Client IP from the platform proxy (null when unknown, e.g. local dev). */
  ip: string | null;
  body: unknown;
  now: Date;
}

export async function handleWidgetMessage(store: WidgetStore, generate: Generate, req: WidgetRequest): Promise<WidgetResult> {
  if (!isValidSessionId(req.sessionId)) return { status: 400, body: { error: "Sesi tidak valid. Muat ulang halaman." } };
  const parsed = WidgetMessageInput.safeParse(req.body);
  if (!parsed.success) return { status: 400, body: { error: parsed.error.issues[0]?.message ?? "Pesan tidak valid." } };

  const shop = await store.findShop(req.slug);
  if (!shop) return { status: 404, body: { error: "Toko tidak ditemukan." } };

  const nowMs = req.now.getTime();
  // Before anything is written: a rejected request must not create a conversation row.
  const limit = await store.hitRateLimit(widgetBuckets({ tenantId: shop.tenantId, sessionId: req.sessionId, ip: req.ip }), nowMs);
  if (limit.limited) {
    return { status: 429, body: { error: "Pesannya terlalu cepat. Tunggu sebentar ya.", retryAfterSeconds: limit.retryAfterSeconds } };
  }

  const conversation = await store.ensureConversation(shop.tenantId, req.sessionId);

  const stored = await store.insertInbound({
    tenantId: shop.tenantId,
    conversationId: conversation.id,
    providerMessageId: `widget:${req.sessionId}:${parsed.data.client_id}`,
    text: parsed.data.text,
  });
  if (!stored) return { status: 200, body: { messages: [], duplicate: true, mode: conversation.mode } };

  await store.touchInbound({
    tenantId: shop.tenantId,
    conversationId: conversation.id,
    nowIso: req.now.toISOString(),
    newWindow: startsNewWindow(conversation.lastInboundAt, nowMs),
  });

  // Human mode: the AI only stores the message; the owner answers from the inbox.
  if (conversation.mode === "human") return { status: 200, body: { messages: [], inbound: stored, mode: "human" } };

  const data = await store.loadTurnData({
    tenantId: shop.tenantId,
    conversationId: conversation.id,
    text: parsed.data.text,
    before: stored.created_at,
  });
  const context: ChatContext = retrieveContext({
    message: parsed.data.text,
    shopName: shop.name,
    persona: shop.persona,
    policies: shop.policies,
    allCards: data.cards,
    kbCandidates: data.kbCandidates,
    history: data.history,
  });
  const cache = store.answers ? { store: store.answers(shop.tenantId), scope: shop.tenantId } : undefined;
  const outcome = await runTurn({ text: parsed.data.text, mode: "ai", context }, generate, { cache });
  const messages = await store.saveOutcome({ shop, conversationId: conversation.id, outcome });
  if (outcome.action === "escalate" && store.notifyEscalation) {
    // The buyer's reply is already stored; a failing notification must not turn it into an error.
    await store.notifyEscalation({ tenantId: shop.tenantId, conversationId: conversation.id, cause: outcome.cause }).catch((e: unknown) => {
      console.error("escalation notification failed", e);
    });
  }
  return { status: 200, body: { messages, inbound: stored, mode: outcome.action === "escalate" ? "human" : "ai" } };
}
