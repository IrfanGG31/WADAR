import { describe, expect, it } from "vitest";
import { memoryAnswerStore } from "../answer-cache";
import { CHAT_CACHE_TTL_MS, chatCacheKey } from "./answer-cache";
import { glowContext } from "./fixtures/glow-by-sari";
import { runTurn, type Generate, type GenerateRequest } from "./pipeline";
import type { ChatReply } from "./schema";

const question = "serum vit c ready? bisa COD?";
const ctx = glowContext(question);
const vitC = ctx.cards.find((c) => c.name === "Serum Vit C 20ml")!;
const good: ChatReply = {
  intent: "stok",
  reply: "Serum Vit C 20ml ready Kak, harganya Rp89.000. COD bisa.",
  sources: [
    { type: "product", id: vitC.variant_id },
    { type: "policy", id: "cod" },
  ],
  confidence: 0.9,
  escalate: false,
};

function model(reply: ChatReply = good) {
  const calls: GenerateRequest[] = [];
  const generate: Generate = async (request) => {
    calls.push(request);
    return { reply, engine: "llm", model: "test-model", runId: `run-${calls.length}` };
  };
  return { generate, calls };
}

function clock(start = 0) {
  const c = { t: start, now: () => c.t };
  return c;
}

describe("chatCacheKey", () => {
  it("same tenant + same question (case/space/trailing ?) + same data → same key", () => {
    const a = chatCacheKey({ scope: "t1", question, context: ctx });
    expect(a).not.toBeNull();
    expect(chatCacheKey({ scope: "t1", question: "  Serum Vit C   READY? bisa cod ??", context: ctx })).toBe(a);
  });

  it("another tenant, another question or changed data (price) → another key", () => {
    const a = chatCacheKey({ scope: "t1", question, context: ctx });
    expect(chatCacheKey({ scope: "t2", question, context: ctx })).not.toBe(a);
    expect(chatCacheKey({ scope: "t1", question: "ongkir ke bandung berapa?", context: ctx })).not.toBe(a);
    const repriced = { ...ctx, cards: ctx.cards.map((c) => (c.variant_id === vitC.variant_id ? { ...c, price: c.price + 1_000 } : c)) };
    expect(chatCacheKey({ scope: "t1", question, context: repriced })).not.toBe(a);
  });

  it("follow-up turns and turns that know the buyer's phone are never cached", () => {
    expect(chatCacheKey({ scope: "t1", question, context: glowContext(question, [{ author: "customer", content: "halo" }]) })).toBeNull();
    expect(chatCacheKey({ scope: "t1", question, context: glowContext(question, [], "+628123456789") })).toBeNull();
  });
});

describe("runTurn with the FAQ answer cache (PDF §C.1)", () => {
  it("(a) a cache hit answers without calling the model", async () => {
    const c = clock();
    const cache = { store: memoryAnswerStore({ now: c.now }), scope: "t1" };
    const { generate, calls } = model();
    const first = await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache });
    expect(first).toMatchObject({ action: "reply", text: good.reply });
    expect(calls).toHaveLength(1);

    const second = await runTurn({ text: "Serum vit C ready?  bisa cod", mode: "ai", context: glowContext("Serum vit C ready?  bisa cod") }, generate, { cache });
    expect(calls).toHaveLength(1);
    expect(second).toMatchObject({ action: "reply", text: good.reply, cached: true, attempts: [] });
  });

  it("(b) the same question in another tenant does not collide", async () => {
    const store = memoryAnswerStore();
    const { generate, calls } = model();
    await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache: { store, scope: "t1" } });
    const other = await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache: { store, scope: "t2" } });
    expect(calls).toHaveLength(2);
    expect(other).not.toHaveProperty("cached");
  });

  it("(c) an expired entry calls the model again", async () => {
    const c = clock();
    const cache = { store: memoryAnswerStore({ now: c.now }), scope: "t1" };
    const { generate, calls } = model();
    await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache });
    c.t = CHAT_CACHE_TTL_MS - 1;
    await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache });
    expect(calls).toHaveLength(1);
    c.t = CHAT_CACHE_TTL_MS + 1;
    const fresh = await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache });
    expect(calls).toHaveLength(2);
    expect(fresh).not.toHaveProperty("cached");
  });

  it("escalations and pre-routed messages are not cached; pre-routing still wins over a cached answer", async () => {
    const store = memoryAnswerStore();
    const cache = { store, scope: "t1" };
    const unsure = model({ ...good, confidence: 0.1, escalate: true });
    await runTurn({ text: question, mode: "ai", context: ctx }, unsure.generate, { cache });
    await runTurn({ text: question, mode: "ai", context: ctx }, unsure.generate, { cache });
    expect(unsure.calls).toHaveLength(2);
    expect((await runTurn({ text: "kasih diskon dong", mode: "ai", context: ctx }, model().generate, { cache })).action).toBe("escalate");
  });

  it("a poisoned cache entry that fails the guardrails is ignored and the model is called", async () => {
    const store = memoryAnswerStore();
    const key = chatCacheKey({ scope: "t1", question, context: ctx })!;
    await store.set(key, { text: "Harganya Rp1.000 Kak", reply: { ...good, reply: "Harganya Rp1.000 Kak" }, engine: "llm", model: "x" }, 60_000);
    const { generate, calls } = model();
    const out = await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache: { store, scope: "t1" } });
    expect(calls).toHaveLength(1);
    expect(out).toMatchObject({ action: "reply", text: good.reply });
  });

  it("a broken store (table missing, network) degrades to a normal model call", async () => {
    const broken = { get: async () => { throw new Error("relation does not exist"); }, set: async () => { throw new Error("down"); } };
    const { generate, calls } = model();
    const out = await runTurn({ text: question, mode: "ai", context: ctx }, generate, { cache: { store: broken, scope: "t1" } });
    expect(calls).toHaveLength(1);
    expect(out.action).toBe("reply");
  });
});
