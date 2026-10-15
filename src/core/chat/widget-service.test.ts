import { describe, expect, it } from "vitest";
import { glowContext } from "./fixtures/glow-by-sari";
import type { Generate } from "./pipeline";
import type { ConversationRow, PublicMessage, WidgetShop, WidgetStore } from "./widget-service";
import { handleWidgetMessage } from "./widget-service";

const ctx = glowContext("serum vit c ready?");
const vitC = ctx.cards.find((c) => c.name === "Serum Vit C 20ml")!;
const SESSION = "A".repeat(24);
const NOW = new Date("2026-10-15T10:00:00.000Z");

function fakeStore(over: { mode?: "ai" | "human"; inbound?: number[] } = {}) {
  const shop: WidgetShop = { tenantId: "t1", name: "Glow by Sari", persona: ctx.persona, policies: ctx.policies };
  const conv: ConversationRow = { id: "c1", mode: over.mode ?? "ai", status: "open", lastInboundAt: null };
  const seen = new Set<string>();
  const saved: unknown[] = [];
  const store: WidgetStore = {
    findShop: async (slug) => (slug === "glow" ? shop : null),
    ensureConversation: async () => conv,
    recentInboundTimes: async () => over.inbound ?? [],
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
  return { store, saved };
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
