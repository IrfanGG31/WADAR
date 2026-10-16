import { describe, expect, it } from "vitest";
import { memoryAnswerStore } from "@/core/answer-cache";
import { DAILY_INSIGHT_TTL_MS } from "@/core/consult/cache";
import { makeData } from "@/core/consult/fixture";
import { addDays } from "@/core/period";
import { selectInsights, weeklyCandidates } from "@/core/consult/insights";
import type { ToolName } from "@/core/consult/tools";
import { CircuitBreaker } from "./breaker";
import { createConsult, type AskRequest, type ConsultModel, type ConsultModelCall } from "./consult";

const KEY = { GOOGLE_GENERATIVE_AI_API_KEY: "test-key" };
const data = makeData();
const req = (over: Partial<AskRequest> = {}): AskRequest => ({
  question: "Kenapa untungku turun minggu ini?",
  history: [],
  data,
  deepRequested: false,
  usage: { total: 0, deep: 0 },
  ...over,
});

/** A scripted model: each call may invoke tools (as the SDK would) then returns the next text. */
function scripted(texts: string[], opts: { tools?: ToolName[]; usage?: { inputTokens: number; cachedTokens: number; outputTokens: number } } = {}) {
  const calls: ConsultModelCall[] = [];
  const model: ConsultModel = {
    async generate(call) {
      calls.push(call);
      for (const t of opts.tools ?? []) call.runTool(t, {});
      call.onDelta?.("draft…");
      const text = texts[Math.min(calls.length - 1, texts.length - 1)];
      return { text, usage: opts.usage ?? { inputTokens: 3000, cachedTokens: 0, outputTokens: 400 } };
    },
  };
  return { model, calls };
}

describe("offline modes are explicit", () => {
  it("no API key → template answer labelled offline with the reason; the model is never called", async () => {
    const { model, calls } = scripted(["tidak dipakai"]);
    const out = await createConsult({ env: {}, model }).ask(req());
    expect(calls).toHaveLength(0);
    expect(out).toMatchObject({ engine: "offline", model: "offline:template-v1", source: "offline", fallbackReason: "no_api_key" });
    expect(out.text).toContain("turun Rp77.340");
    expect(out.attempts[0].meter?.costIdr).toBe("0.00");
  });

  it("DEMO_SAFE=1 wins over a key", async () => {
    const { model, calls } = scripted(["x"]);
    const out = await createConsult({ env: { ...KEY, DEMO_SAFE: "1" }, model }).ask(req());
    expect(calls).toHaveLength(0);
    expect(out.fallbackReason).toBe("demo_safe");
  });

  it("a key but no provider is reported, not hidden", async () => {
    const out = await createConsult({ env: KEY }).ask(req());
    expect(out).toMatchObject({ engine: "offline", fallbackReason: "no_provider" });
  });

  it("a throwing model falls back to the template with provider_error", async () => {
    const model: ConsultModel = { generate: async () => { throw new Error("503 upstream"); } };
    const out = await createConsult({ env: KEY, model, breaker: new CircuitBreaker() }).ask(req());
    expect(out).toMatchObject({ engine: "offline", fallbackReason: "provider_error" });
    expect(out.attempts.at(-1)?.error).toContain("503");
  });
});

describe("grounded LLM answers", () => {
  it("passes when every number is in the snapshot / tool results; costs are metered", async () => {
    const { model, calls } = scripted(["Untung bersih turun Rp77.340 (10,7%) menjadi Rp647.560."], { tools: ["explain_profit_change"] });
    const events: string[] = [];
    const out = await createConsult({ env: KEY, model }).ask(req(), (e) => events.push(e.type));
    expect(calls).toHaveLength(1);
    expect(out).toMatchObject({ engine: "llm", source: "model", tier: "consult_fast", model: "gemini-3.1-flash-lite" });
    expect(out.toolsUsed).toEqual(["explain_profit_change"]);
    // 3000 in × $0.25 + 400 out × $1.50 per 1M → Rp32,37 with kurs/PPN/buffer (src/ai/meter.ts)
    expect(out.attempts[0].meter?.costIdr).toBe("32.37");
    expect(events).toContain("delta");
    expect(calls[0].maxSteps).toBe(4);
    expect(calls[0].system).toContain("SNAPSHOT:");
    expect(calls[0].system).toContain("Jangan pernah diskon di atas 15%"); // pinned preference
  });

  it("fails once → regenerates with feedback → passes", async () => {
    const { model, calls } = scripted(["Untung turun Rp3.456.789.", "Untung bersih turun Rp77.340."], { tools: ["explain_profit_change"] });
    const out = await createConsult({ env: KEY, model }).ask(req());
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain("Rp3.456.789");
    expect(out).toMatchObject({ engine: "llm", source: "regenerated" });
    expect(out.attempts[0].rejected.map((c) => c.text)).toEqual(["Rp3.456.789"]);
    expect(out.attempts).toHaveLength(2);
  });

  it("fails twice → template from tool results, and says so", async () => {
    const { model, calls } = scripted(["Untung turun Rp3.456.789.", "Untung turun Rp9.876.543."], { tools: ["explain_profit_change"] });
    const out = await createConsult({ env: KEY, model }).ask(req());
    expect(calls).toHaveLength(2);
    expect(out.source).toBe("template");
    expect(out.engine).toBe("llm"); // the model was called; its drafts were rejected
    expect(out.text).toContain("turun Rp77.340 (10,7%)");
    expect(out.text).not.toContain("Rp9.876.543");
    expect(out.attempts.every((a) => a.rejected.length === 1)).toBe(true);
  });

  it("without tool calls the template falls back to the business snapshot", async () => {
    const { model } = scripted(["Angka salah Rp8.765.432."]);
    const out = await createConsult({ env: KEY, model }).ask(req({ question: "gimana toko?" }));
    expect(out.source).toBe("template");
    expect(out.text).toContain("Penjualan hari ini Rp120.000");
  });

  it("a number from the owner's saved preferences may be quoted", async () => {
    const { model } = scripted(["Batas diskon 15% kamu masih aman."]);
    const out = await createConsult({ env: KEY, model }).ask(req({ question: "Apakah diskon 15% masih aman?" }));
    expect(out.source).toBe("model");
  });

  it("a number only in the question (or client-sent history) is not evidence", async () => {
    const { model, calls } = scripted(["Omzetmu turun 33% karena sepi.", "Omzetmu turun 33%."], { tools: ["explain_profit_change"] });
    const out = await createConsult({ env: KEY, model }).ask(
      req({ question: "Kenapa omzet turun 33%?", history: [{ role: "assistant", content: "Omzet turun 33%, untung Rp4.444.444." }] }),
    );
    expect(out.source).toBe("template");
    expect(calls[1].messages.at(-1)?.content).toMatch(/pertanyaan/);
  });

  it("a leading question with the wrong direction is rejected (data says turun)", async () => {
    const { model } = scripted(["Untung bersih naik Rp77.340 (10,7%)."], { tools: ["explain_profit_change"] });
    const out = await createConsult({ env: KEY, model }).ask(req({ question: "Kenapa untung naik minggu ini?" }));
    expect(out.source).toBe("template");
    expect(out.text).toContain("turun Rp77.340");
  });

  it("an empty answer becomes the template", async () => {
    const { model } = scripted(["", "   "], { tools: ["explain_profit_change"] });
    const out = await createConsult({ env: KEY, model }).ask(req());
    expect(out.source).toBe("template");
    expect(out.text.trim()).not.toBe("");
  });
});

describe("tier selection", () => {
  const ok = ["Untung turun Rp77.340."];
  it("deep only on button + deep question + quota", async () => {
    const a = scripted(ok);
    const deep = await createConsult({ env: KEY, model: a.model }).ask(req({ deepRequested: true }));
    expect(deep).toMatchObject({ tier: "consult_deep", model: "gemini-3-flash" });
    expect(a.calls[0].maxOutputTokens).toBe(700);

    const b = scripted(ok);
    const fast = await createConsult({ env: KEY, model: b.model }).ask(req({ deepRequested: false }));
    expect(fast).toMatchObject({ tier: "consult_fast", model: "gemini-3.1-flash-lite" });
    expect(b.calls[0].maxOutputTokens).toBe(400);

    const c = scripted(ok);
    const quota = await createConsult({ env: KEY, model: c.model }).ask(req({ deepRequested: true, usage: { total: 4, deep: 1 } }));
    expect(quota).toMatchObject({ tier: "consult_fast", tierReason: "deep_quota_exhausted" });
  });

  it("keeps only the last 8 turns", async () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `t${i}` }));
    const { model, calls } = scripted(["Untung turun Rp77.340."]);
    await createConsult({ env: KEY, model }).ask(req({ history }));
    expect(calls[0].messages).toHaveLength(9); // 8 + the question
    expect(calls[0].messages[0].content).toBe("t4");
  });
});

describe("remember (CON-4)", () => {
  it("proposes the memory without calling any model or writing anything", async () => {
    const { model, calls } = scripted(["x"]);
    const out = await createConsult({ env: KEY, model }).ask(req({ question: "Ingat ya, jangan pernah diskon di atas 15%" }));
    expect(calls).toHaveLength(0);
    expect(out).toMatchObject({ kind: "remember", remember: { kind: "preference", content: "jangan pernah diskon di atas 15%" }, attempts: [] });
  });
});

describe("weekly narration (narrate task)", () => {
  const top = selectInsights(weeklyCandidates(data), new Set());

  it("uses narrate with the same grounding; a bad number → template", async () => {
    const good = scripted([`1. Serum kritis, penjualannya Rp1.619.800. 2. Hair Mist menahan Rp1.200.000. Ringkasan: dampak ±Rp${top.reduce((s, c) => s + c.impact, 0).toLocaleString("id-ID")}.`]);
    const g = await createConsult({ env: KEY, model: good.model }).narrateWeekly(top, data);
    expect(g).toMatchObject({ engine: "llm", model: "gemini-3.1-flash-lite", source: "model" });
    expect(good.calls[0].tools).toEqual([]);

    const bad = scripted(["Dampaknya Rp77.777.777."]);
    const b = await createConsult({ env: KEY, model: bad.model }).narrateWeekly(top, data);
    expect(b.source).toBe("template");
    expect(b.text).toContain("Rp1.619.800");
  });

  it("offline: template narration, labelled", async () => {
    const r = await createConsult({ env: {} }).narrateWeekly(top, data);
    expect(r).toMatchObject({ engine: "offline", fallbackReason: "no_api_key" });
    expect(r.text.split("\n")).toHaveLength(4); // summary + 3 points
  });
});

describe("cache (DEMO_SAFE, SPRINT-8D §5)", () => {
  const SCOPE = { cacheScope: "tenant-1" };

  it("DEMO_SAFE: the second identical question is replayed — labelled cached, no attempts/cost", async () => {
    const c = createConsult({ env: { ...KEY, DEMO_SAFE: "1" } });
    const first = await c.ask(req(SCOPE));
    const second = await c.ask(req({ ...SCOPE, question: "  kenapa UNTUNGKU turun minggu ini ?" }));
    expect(first.cached).toBeUndefined();
    expect(second).toMatchObject({ cached: true, engine: "offline", fallbackReason: "demo_safe", text: first.text });
    expect(second.attempts).toEqual([]);
  });

  it("a changed data fingerprint (new sale) or another tenant misses", async () => {
    const c = createConsult({ env: { ...KEY, DEMO_SAFE: "1" } });
    await c.ask(req(SCOPE));
    const sold = makeData({ lines: data.lines.map((l, i) => (i === 0 ? { ...l, qty: l.qty + 1 } : l)) });
    expect((await c.ask(req({ ...SCOPE, data: sold }))).cached).toBeUndefined();
    expect((await c.ask(req({ cacheScope: "tenant-2" }))).cached).toBeUndefined();
  });

  it("expires after the TTL", async () => {
    let t = 0;
    const c = createConsult({ env: { ...KEY, DEMO_SAFE: "1" }, now: () => t, cacheTtlMs: 1000 });
    await c.ask(req(SCOPE));
    t = 999;
    expect((await c.ask(req(SCOPE))).cached).toBe(true);
    t = 2500;
    expect((await c.ask(req(SCOPE))).cached).toBeUndefined();
  });

  it("without cacheScope nothing is cached, and clearCache() forgets", async () => {
    const c = createConsult({ env: { ...KEY, DEMO_SAFE: "1" } });
    await c.ask(req());
    expect((await c.ask(req())).cached).toBeUndefined();
    await c.ask(req(SCOPE));
    c.clearCache();
    expect((await c.ask(req(SCOPE))).cached).toBeUndefined();
  });

  it("live: a configured model is called every time (no replay while it works)", async () => {
    const { model, calls } = scripted(["Untungmu turun Rp77.340 minggu ini."], { tools: ["explain_profit_change"] });
    const c = createConsult({ env: KEY, model, breaker: new CircuitBreaker() });
    const a = await c.ask(req(SCOPE));
    const b = await c.ask(req(SCOPE));
    expect(calls).toHaveLength(2);
    expect(a.engine).toBe("llm");
    expect(b.cached).toBeUndefined();
  });

  it("a model that later fails replays the earlier grounded answer instead of the template", async () => {
    let fail = false;
    const ok = scripted(["Untungmu turun Rp77.340 minggu ini."], { tools: ["explain_profit_change"] }).model;
    const model: ConsultModel = { generate: (call) => (fail ? Promise.reject(new Error("503")) : ok.generate(call)) };
    const c = createConsult({ env: KEY, model, breaker: new CircuitBreaker() });
    const live = await c.ask(req(SCOPE));
    expect(live).toMatchObject({ engine: "llm", source: "model" });
    fail = true;
    const replayed = await c.ask(req(SCOPE));
    expect(replayed).toMatchObject({ cached: true, engine: "llm", text: live.text });
    expect(replayed.attempts).toEqual([]);
    // a different question has nothing cached → honest offline fallback
    expect((await c.ask(req({ ...SCOPE, question: "Stok apa yang menipis?" }))).fallbackReason).toBe("provider_error");
  });

  it("a draft that failed grounding and became the template is never cached", async () => {
    const { model } = scripted(["Untungmu turun Rp999.999.999."], { tools: ["explain_profit_change"] });
    const c = createConsult({ env: KEY, model, breaker: new CircuitBreaker() });
    expect((await c.ask(req(SCOPE))).source).toBe("template");
    const fail: ConsultModel = { generate: async () => { throw new Error("503"); } };
    const c2 = createConsult({ env: KEY, model: fail, breaker: new CircuitBreaker() });
    expect((await c2.ask(req(SCOPE))).cached).toBeUndefined();
  });

  it("weekly narration is cached the same way", async () => {
    const selected = selectInsights(weeklyCandidates(data), new Set());
    const c = createConsult({ env: { ...KEY, DEMO_SAFE: "1" } });
    const first = await c.narrateWeekly(selected, data, undefined, SCOPE);
    const second = await c.narrateWeekly(selected, data, undefined, SCOPE);
    expect(second).toMatchObject({ cached: true, text: first.text });
    expect((await c.narrateWeekly(selected.slice(1), data, undefined, SCOPE)).cached).toBeUndefined();
    expect((await c.narrateWeekly(selected, data)).cached).toBeUndefined();
  });
});

describe("daily insight cache (PDF §C.1 \"ringkasan harian\"), read before the model", () => {
  const top = selectInsights(weeklyCandidates(data), new Set());
  const text = `Ringkasan: dampak ±Rp${top.reduce((s, c) => s + c.impact, 0).toLocaleString("id-ID")}.`;
  const live = () => scripted([text, text, text, text]);

  it("(a) same tenant, same day → one model call, even after a new sale; replay has no attempts", async () => {
    const { model, calls } = live();
    const c = createConsult({ env: KEY, model, breaker: new CircuitBreaker() });
    const first = await c.narrateWeekly(top, data, undefined, { cacheScope: "t1" });
    expect(first).toMatchObject({ engine: "llm", source: "model" });
    const sold = makeData({ lines: data.lines.map((l, i) => (i === 0 ? { ...l, qty: l.qty + 1 } : l)) });
    const again = await c.narrateWeekly(top, sold, undefined, { cacheScope: "t1" });
    expect(calls).toHaveLength(1);
    expect(again).toMatchObject({ cached: true, text: first.text, attempts: [] });
  });

  it("(b) another tenant or the next day calls the model", async () => {
    const { model, calls } = live();
    const c = createConsult({ env: KEY, model, breaker: new CircuitBreaker() });
    await c.narrateWeekly(top, data, undefined, { cacheScope: "t1" });
    expect((await c.narrateWeekly(top, data, undefined, { cacheScope: "t2" })).cached).toBeUndefined();
    expect(calls).toHaveLength(2);
    await c.narrateWeekly(top, { ...data, today: addDays(data.today, 1) }, undefined, { cacheScope: "t1" });
    expect(calls).toHaveLength(3);
  });

  it("(c) expires after the daily TTL", async () => {
    let t = 0;
    const { model, calls } = live();
    const c = createConsult({ env: KEY, model, breaker: new CircuitBreaker(), now: () => t });
    await c.narrateWeekly(top, data, undefined, { cacheScope: "t1" });
    t = DAILY_INSIGHT_TTL_MS - 1;
    await c.narrateWeekly(top, data, undefined, { cacheScope: "t1" });
    expect(calls).toHaveLength(1);
    t = DAILY_INSIGHT_TTL_MS + 1;
    await c.narrateWeekly(top, data, undefined, { cacheScope: "t1" });
    expect(calls).toHaveLength(2);
  });

  it("a shared store lets another instance replay without calling its model", async () => {
    const shared = memoryAnswerStore();
    const one = live();
    await createConsult({ env: KEY, model: one.model, breaker: new CircuitBreaker() }).narrateWeekly(top, data, undefined, { cacheScope: "t1", store: shared });
    const two = live();
    const r = await createConsult({ env: KEY, model: two.model, breaker: new CircuitBreaker() }).narrateWeekly(top, data, undefined, { cacheScope: "t1", store: shared });
    expect(two.calls).toHaveLength(0);
    expect(r).toMatchObject({ cached: true, engine: "llm" });
  });
});
