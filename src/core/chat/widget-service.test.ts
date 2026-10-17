import { describe, expect, it, vi } from "vitest";
import { glowContext } from "./fixtures/glow-by-sari";
import type { Generate } from "./pipeline";
import { WIDGET_IP_LIMIT, WIDGET_SESSION_LIMIT, WIDGET_TENANT_LIMIT } from "./widget";
import type { ConversationRow, PublicMessage, WidgetShop, WidgetStore } from "./widget-service";
import { handleWidgetMessage } from "./widget-service";
import { memoryAnswerStore } from "@/core/answer-cache";
import { notifyEscalation, type NotificationPrefs, type NotificationRow } from "@/core/notify";
import { createMemoryRateLimiter, type RateLimiter } from "@/core/rate-limit";

const ctx = glowContext("serum vit c ready?");
const vitC = ctx.cards.find((c) => c.name === "Serum Vit C 20ml")!;
const SESSION = "A".repeat(24);
const NOW = new Date("2026-10-15T10:00:00.000Z");

function fakeStore(over: { mode?: "ai" | "human"; inbound?: number[]; limiter?: RateLimiter } = {}) {
  const shop = (tenantId: string): WidgetShop => ({ tenantId, name: "Glow by Sari", persona: ctx.persona, policies: ctx.policies });
  const conv: ConversationRow = { id: "c1", mode: over.mode ?? "ai", status: "open", lastInboundAt: null };
  const seen = new Set<string>();
  const saved: unknown[] = [];
  const conversations: string[] = [];
  const limiter = over.limiter ?? createMemoryRateLimiter();
  // Pre-load the session bucket the way earlier requests would have.
  for (const t of over.inbound ?? []) void limiter.hit([{ key: `session:t1:${SESSION}`, limit: Infinity }], t);
  const store: WidgetStore = {
    findShop: async (slug) => (slug === "glow" ? shop("t1") : slug === "other" ? shop("t2") : null),
    ensureConversation: async (_tenantId, sessionId) => {
      conversations.push(sessionId);
      return conv;
    },
    hitRateLimit: (buckets, nowMs) => limiter.hit(buckets, nowMs),
    insertInbound: async ({ providerMessageId, text }) => {
      if (seen.has(providerMessageId)) return null;
      seen.add(providerMessageId);
      return { id: "m-in", author: "customer", content: text, created_at: NOW.toISOString() };
    },
    touchInbound: async () => undefined,
    loadTurnData: async () => ({ cards: ctx.cards, kbCandidates: [], history: [] }),
    saveOutcome: async ({ outcome }) => {
      saved.push(outcome);
      const text = outcome.action === "store_only" ? "" : outcome.text;
      return [{ id: "m-out", author: outcome.action === "reply" ? "ai" : "system", content: text, created_at: NOW.toISOString() } as PublicMessage];
    },
  };
  return { store, saved, conversations };
}

const good: Generate = async () => ({
  reply: {
    intent: "stok",
    reply: "Serum Vit C 20ml ready Kak, harganya Rp89.000.",
    sources: [{ type: "product", id: vitC.variant_id }],
    confidence: 0.9,
    escalate: false,
  },
  engine: "offline",
  model: "offline:template-v1",
});
const forbidden: Generate = async () => ({
  reply: { intent: "stok", reply: "Modalnya 38rb Kak.", sources: [{ type: "product", id: vitC.variant_id }], confidence: 0.9, escalate: false },
  engine: "llm",
  model: "m",
});
const req = (over: Record<string, unknown> = {}) => ({
  slug: "glow",
  sessionId: SESSION,
  ip: "203.0.113.7",
  body: { text: "serum vit c ready?", client_id: "client-0001" },
  now: NOW,
  ...over,
});

describe("handleWidgetMessage", () => {
  it("answers through the shared pipeline", async () => {
    const { store } = fakeStore();
    const r = await handleWidgetMessage(store, good, req());
    expect(r).toMatchObject({ status: 200, body: { mode: "ai" } });
    expect(r.status === 200 && r.body.messages[0]).toMatchObject({ author: "ai" });
  });

  it("FAQ cache: a second visitor asking the same thing is answered without the model, per shop", async () => {
    const { store, saved } = fakeStore();
    const answers = memoryAnswerStore();
    store.answers = () => answers;
    let calls = 0;
    const live: Generate = async (r) => {
      calls++;
      return { ...(await good(r)), engine: "llm", model: "m" };
    };
    await handleWidgetMessage(store, live, req());
    await handleWidgetMessage(store, live, req({ sessionId: "B".repeat(24), ip: "203.0.113.8" }));
    expect(calls).toBe(1);
    expect(saved[1]).toMatchObject({ action: "reply", cached: true, attempts: [] });
    await handleWidgetMessage(store, live, req({ slug: "other", sessionId: "C".repeat(24), ip: "203.0.113.9" }));
    expect(calls).toBe(2);
  });

  it("rejects a bad session, bad body and unknown shop", async () => {
    const { store } = fakeStore();
    expect((await handleWidgetMessage(store, good, req({ sessionId: "short" }))).status).toBe(400);
    expect((await handleWidgetMessage(store, good, req({ body: { text: "  ", client_id: "client-0001" } }))).status).toBe(400);
    expect((await handleWidgetMessage(store, good, req({ slug: "nope" }))).status).toBe(404);
  });

  it("limits to 10 messages per minute per session", async () => {
    const inbound = Array.from({ length: 10 }, (_, i) => NOW.getTime() - i * 1000);
    const r = await handleWidgetMessage(fakeStore({ inbound }).store, good, req());
    expect(r).toMatchObject({ status: 429, body: { retryAfterSeconds: expect.any(Number) } });
    const ok = await handleWidgetMessage(fakeStore({ inbound: inbound.slice(1) }).store, good, req());
    expect(ok.status).toBe(200);
  });

  it("keeps limiting a client that drops its cookie (fresh session id per request, same IP)", async () => {
    const { store, conversations } = fakeStore();
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await handleWidgetMessage(store, good, req({ sessionId: `fresh-session-${String(i).padStart(10, "0")}`, body: { text: "halo", client_id: `client-${i}-xxxx` } }));
      statuses.push(r.status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(WIDGET_IP_LIMIT);
    expect(statuses.slice(WIDGET_IP_LIMIT).every((s) => s === 429)).toBe(true);
    // The limit is checked before the conversation upsert: rejected requests create nothing.
    expect(conversations).toHaveLength(WIDGET_IP_LIMIT);
  });

  it("does not let parallel requests slip past the limit together", async () => {
    const { store } = fakeStore();
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => handleWidgetMessage(store, good, req({ body: { text: "halo", client_id: `parallel-${i}-xx` } }))),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(WIDGET_SESSION_LIMIT);
  });

  it("caps a whole shop across IPs, without touching another shop", async () => {
    const { store } = fakeStore();
    let ok = 0;
    for (let i = 0; i < WIDGET_TENANT_LIMIT + 5; i++) {
      const r = await handleWidgetMessage(store, good, req({ sessionId: `spray-session-${String(i).padStart(10, "0")}`, ip: `198.51.100.${i % 250}.${i}`, body: { text: "halo", client_id: `spray-${i}-xxx` } }));
      if (r.status === 200) ok += 1;
    }
    expect(ok).toBe(WIDGET_TENANT_LIMIT);
    const other = await handleWidgetMessage(store, good, req({ slug: "other", body: { text: "halo", client_id: "other-0001" } }));
    expect(other.status).toBe(200);
  });

  it("stores a retried client_id once and does not answer twice", async () => {
    const { store, saved } = fakeStore();
    await handleWidgetMessage(store, good, req());
    const again = await handleWidgetMessage(store, good, req());
    expect(again).toMatchObject({ status: 200, body: { duplicate: true, messages: [] } });
    expect(saved).toHaveLength(1);
  });

  it("only stores the message in human mode", async () => {
    const { store, saved } = fakeStore({ mode: "human" });
    expect(await handleWidgetMessage(store, good, req())).toMatchObject({ status: 200, body: { messages: [], mode: "human" } });
    expect(saved).toHaveLength(0);
  });

  it("never shows a forbidden reply: the visitor gets the holding message", async () => {
    const { store } = fakeStore();
    const r = await handleWidgetMessage(store, forbidden, req());
    expect(r.status === 200 && r.body.messages[0].content).not.toMatch(/modal/i);
    expect(r).toMatchObject({ status: 200, body: { mode: "human" } });
  });
});

/** GAP #7: an escalated chat notifies the owner — through the store, with the shop's preferences. */
describe("handleWidgetMessage → owner notification", () => {
  function notifying(prefs: NotificationPrefs | null, over: { mode?: "ai" | "human" } = {}) {
    const base = fakeStore(over);
    const rows: NotificationRow[] = [];
    const calls: { tenantId: string; conversationId: string; cause: string }[] = [];
    base.store.notifyEscalation = async (args) => {
      calls.push(args);
      await notifyEscalation(
        {
          loadPrefs: async () => prefs,
          insertNotification: async (row) => {
            rows.push(row);
          },
          listPushSubscriptions: async () => [],
          removePushSubscription: async () => undefined,
        },
        args,
      );
    };
    return { ...base, rows, calls };
  }
  const ON = { on_escalation: true, push_enabled: false };
  const askAdmin = req({ body: { text: "kak saya mau bicara dengan admin", client_id: "client-0002" } });

  it("a buyer asking for a person → one notification row for this shop and conversation", async () => {
    const { store, rows, calls } = notifying(ON);
    const r = await handleWidgetMessage(store, good, askAdmin);
    expect(r).toMatchObject({ status: 200, body: { mode: "human" } });
    expect(calls).toEqual([{ tenantId: "t1", conversationId: "c1", cause: "human_requested" }]);
    expect(rows).toEqual([expect.objectContaining({ tenant_id: "t1", kind: "chat_escalated", conversation_id: "c1" })]);
  });

  it("the AI can't answer safely (guardrail) → notified too", async () => {
    const { store, rows } = notifying(ON);
    await handleWidgetMessage(store, forbidden, req());
    expect(rows).toHaveLength(1);
  });

  it("escalation with alerts switched off → no notification row", async () => {
    const { store, rows, calls } = notifying({ on_escalation: false, push_enabled: false });
    await handleWidgetMessage(store, good, askAdmin);
    expect(calls).toHaveLength(1);
    expect(rows).toEqual([]);
  });

  it("a normal answered chat → no notification", async () => {
    const { store, rows, calls } = notifying(ON);
    await handleWidgetMessage(store, good, req());
    expect(calls).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("a conversation already with the owner (human mode) → no repeat notification", async () => {
    const { store, calls } = notifying(ON, { mode: "human" });
    await handleWidgetMessage(store, good, askAdmin);
    expect(calls).toEqual([]);
  });

  it("a failing notification never costs the buyer their reply", async () => {
    const { store } = fakeStore();
    store.notifyEscalation = async () => {
      throw new Error("push down");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await handleWidgetMessage(store, good, askAdmin);
    expect(r).toMatchObject({ status: 200, body: { mode: "human" } });
    expect(r.status === 200 && r.body.messages).toHaveLength(1);
    spy.mockRestore();
  });
});
