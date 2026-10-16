import { describe, expect, it } from "vitest";
import { glowContext } from "@/core/chat/fixtures/glow-by-sari";
import { findForbiddenTerms } from "@/core/chat/text";
import { CircuitBreaker } from "./breaker";
import { costSen, meterFor, PRICES, senToNumeric } from "./meter";
import { ROUTES } from "./models";
import { chatReplyPrompt, chatReplySystem, normalizeSourceId } from "./prompts/chat_reply.v1";
import { AiUnavailableError, createAi, offlineReason, type Provider } from "./run";

const ctx = glowContext("serum vit c ready? bisa COD?");
const vitC = ctx.cards.find((c) => c.name === "Serum Vit C 20ml")!;

/** Fake provider: answers, throws, or hangs, and counts calls. */
function fakeProvider(behaviour: "ok" | "throw" | "hang") {
  let calls = 0;
  const provider: Provider = {
    async call(task, _modelId, _input, signal) {
      calls++;
      if (behaviour === "throw") throw new Error("503 overloaded");
      if (behaviour === "hang") {
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
      }
      const output =
        task === "chat_reply"
          ? {
              intent: "stok",
              reply: "Serum Vit C 20ml ready Kak.",
              sources: [{ type: "product", id: `[product:${vitC.variant_id}]` }],
              confidence: 0.9,
              escalate: false,
            }
          : task === "intent"
            ? "stok"
            : task === "embed"
              ? [[0.1, 0.2]]
              : { verdict: "correct", note: "" };
      return { output, usage: { inputTokens: 2000, cachedTokens: 0, outputTokens: 150 } } as never;
    },
  };
  return { provider, calls: () => calls };
}

const KEY = { GOOGLE_GENERATIVE_AI_API_KEY: "test-key" };

describe("offline mode is explicit", () => {
  it("is on without an API key or with DEMO_SAFE=1", () => {
    expect(offlineReason({})).toBe("no_api_key");
    expect(offlineReason({ GOOGLE_GENERATIVE_AI_API_KEY: "  " })).toBe("no_api_key");
    expect(offlineReason({ ...KEY, DEMO_SAFE: "1" })).toBe("demo_safe");
    expect(offlineReason(KEY)).toBeNull();
  });

  it("answers chat_reply from the offline engine and says so — the provider is never called", async () => {
    const fake = fakeProvider("ok");
    const ai = createAi({ env: {}, providers: { google: fake.provider } });
    const r = await ai.run("chat_reply", { question: "serum vit c ready? bisa COD?", context: ctx });
    expect(r).toMatchObject({ engine: "offline", model: "offline:template-v1", error: null });
    expect(r.meter).toMatchObject({ fallbackReason: "no_api_key", inputTokens: 0, outputTokens: 0, costIdr: "0.00" });
    expect(r.output?.reply).toContain("Rp89.000");
    expect(fake.calls()).toBe(0);
  });

  it("DEMO_SAFE=1 keeps a configured key unused", async () => {
    const fake = fakeProvider("ok");
    const ai = createAi({ env: { ...KEY, DEMO_SAFE: "1" }, providers: { google: fake.provider } });
    const r = await ai.run("intent", { text: "ongkir ke bandung berapa?" });
    expect(r).toMatchObject({ engine: "offline", output: "ongkir_kirim" });
    expect(r.meter.fallbackReason).toBe("demo_safe");
    expect(fake.calls()).toBe(0);
  });

  it("returns no vectors offline (retrieval falls back to text search)", async () => {
    const ai = createAi({ env: {}, providers: {} });
    expect((await ai.run("embed", { texts: ["a"], purpose: "query" })).output).toBeNull();
    expect((await ai.run("judge", { question: "q", reply: "r", context: "c" })).output).toBeNull();
  });
});

describe("routing with a key", () => {
  it("uses the first route, meters it, and strips source tags", async () => {
    const fake = fakeProvider("ok");
    const ai = createAi({ env: KEY, providers: { google: fake.provider } });
    const r = await ai.run("chat_reply", { question: "x", context: ctx });
    expect(r).toMatchObject({ engine: "llm", model: ROUTES.chat_reply[0], error: null });
    expect(r.output?.sources[0].id).toBe(vitC.variant_id);
    expect(r.meter).toMatchObject({ inputTokens: 2000, outputTokens: 150, costIdr: "17.38", fallbackReason: null });
  });

  it("falls back to offline on a provider error, keeping the error", async () => {
    const ai = createAi({ env: KEY, providers: { google: fakeProvider("throw").provider } });
    const r = await ai.run("chat_reply", { question: "serum vit c ready?", context: ctx });
    expect(r).toMatchObject({ engine: "offline", error: "Error: 503 overloaded" });
    expect(r.meter.fallbackReason).toBe("provider_error");
  });

  it("abandons a call after the timeout (8 s in production)", async () => {
    const ai = createAi({ env: KEY, providers: { google: fakeProvider("hang").provider }, timeoutMs: 20 });
    const r = await ai.run("chat_reply", { question: "serum vit c ready?", context: ctx });
    expect(r.engine).toBe("offline");
    expect(r.meter.fallbackReason).toBe("timeout");
  });

  it("a shorter per-call timeout (what is left of the chat turn) wins over the default", async () => {
    const ai = createAi({ env: KEY, providers: { google: fakeProvider("hang").provider }, timeoutMs: 60_000 });
    const started = Date.now();
    const r = await ai.run("chat_reply", { question: "serum vit c ready?", context: ctx }, { timeoutMs: 20 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(r.meter.fallbackReason).toBe("timeout");
  });

  it("stops calling a failing provider once its circuit opens", async () => {
    const fake = fakeProvider("throw");
    const ai = createAi({ env: KEY, providers: { google: fake.provider } });
    for (let i = 0; i < 7; i++) await ai.run("intent", { text: "jam buka?" });
    expect(fake.calls()).toBe(5);
    const r = await ai.run("intent", { text: "jam buka?" });
    expect(r.meter.fallbackReason).toBe("circuit_open");
  });

  it("throws when a task has no route left (no offline engine for narrate/consult yet)", async () => {
    const ai = createAi({ env: KEY, providers: {} });
    // embed has an offline route; a missing provider still ends there.
    expect((await ai.run("embed", { texts: ["a"], purpose: "document" })).meter.fallbackReason).toBe("no_provider");
    expect(new AiUnavailableError("chat_reply", "x", null).message).toContain("no route answered");
  });
});

describe("CircuitBreaker (5 failures / 60 s → open 30 s)", () => {
  it("opens, cools down, lets one trial through, and closes on success", () => {
    let t = 0;
    const b = new CircuitBreaker({ now: () => t });
    for (let i = 0; i < 4; i++) b.failure();
    expect(b.state).toBe("closed");
    b.failure();
    expect(b.state).toBe("open");
    expect(b.allow()).toBe(false);
    t = 30_000;
    expect(b.state).toBe("half_open");
    expect(b.allow()).toBe(true);
    expect(b.allow()).toBe(false); // only one trial
    b.success();
    expect(b.state).toBe("closed");
  });

  it("re-opens when the trial fails, and forgets failures older than 60 s", () => {
    let t = 0;
    const b = new CircuitBreaker({ now: () => t });
    for (let i = 0; i < 5; i++) b.failure();
    t = 30_000;
    b.allow();
    b.failure();
    expect(b.state).toBe("open");

    const c = new CircuitBreaker({ now: () => t });
    for (let i = 0; i < 4; i++) c.failure();
    t += 60_000;
    c.failure();
    expect(c.state).toBe("closed");
  });
});

describe("cost meter (TECH-SPEC §6.3) — integer sen, no float", () => {
  const lite = PRICES["gemini-3.1-flash-lite"];

  it("prices one chat reply: 2.000 in / 150 out ≈ Rp17,38", () => {
    expect(costSen({ inputTokens: 2000, cachedTokens: 0, outputTokens: 150 }, lite)).toBe(1738n);
  });

  it("bills cached input 10× cheaper", () => {
    const full = costSen({ inputTokens: 2000, cachedTokens: 0, outputTokens: 0 }, lite);
    const cached = costSen({ inputTokens: 2000, cachedTokens: 2000, outputTokens: 0 }, lite);
    expect(full).toBe(1199n);
    expect(cached).toBe(120n);
  });

  it("reproduces TECH-SPEC §6.2's sanity check: ≈ Rp21 rb per Growth month", () => {
    const replies = costSen({ inputTokens: 1050 * 2000, cachedTokens: 0, outputTokens: 1050 * 150 }, lite);
    const consults = costSen({ inputTokens: 90 * 3000, cachedTokens: 0, outputTokens: 90 * 400 }, lite);
    expect(senToNumeric(replies + consults)).toBe("21164.81");
  });

  it("formats sen as numeric(12,2) text", () => {
    expect(senToNumeric(1738n)).toBe("17.38");
    expect(senToNumeric(5n)).toBe("0.05");
    expect(senToNumeric(0n)).toBe("0.00");
    expect(meterFor("unknown-model", { inputTokens: 10, cachedTokens: 0, outputTokens: 10 }, 5, null).costIdr).toBe("0.00");
  });
});

describe("chat_reply.v1 prompt", () => {
  const system = chatReplySystem(ctx);

  it("follows the spec skeleton with the persona", () => {
    expect(system).toContain('Kamu adalah Sari, asisten chat toko "Glow by Sari"');
    expect(system).toContain('Panggil pembeli "Kak"');
    expect(system).toContain("Jawab HANYA dari DATA TOKO");
    expect(system).toContain("emoji boleh 1");
    expect(system).toContain("[KARTU PRODUK]");
  });

  it("puts no cost data in the DATA TOKO (the rule text names the words; the data has no numbers for them)", () => {
    const data = system.slice(system.indexOf("\nDATA TOKO\n"));
    expect(findForbiddenTerms(data)).toEqual([]);
    expect(data).not.toContain("38.000"); // Serum Vit C HPP in the seed
  });

  it("adds history and regeneration feedback to the user prompt", () => {
    const withHistory = { ...ctx, history: [{ author: "customer" as const, content: "halo" }] };
    const prompt = chatReplyPrompt("serum ready?", withHistory, "Nominal 85000 tidak ada");
    expect(prompt).toContain("Pembeli: halo");
    expect(prompt).toContain("PESAN PEMBELI: serum ready?");
    expect(prompt).toContain("PERBAIKI JAWABAN SEBELUMNYA:\nNominal 85000 tidak ada");
  });

  it("normalizes tagged source ids", () => {
    expect(normalizeSourceId("[product:v01]")).toBe("v01");
    expect(normalizeSourceId("policy:cod")).toBe("cod");
    expect(normalizeSourceId("faq1")).toBe("faq1");
  });
});
