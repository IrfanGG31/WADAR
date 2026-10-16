import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { glowContext } from "./fixtures/glow-by-sari";
import { MIN_ATTEMPT_MS, runTurn, TURN_BUDGET_MS, type Generate, type GenerateRequest } from "./pipeline";
import type { ChatReply } from "./schema";
import { DEFAULT_HOLDING_MESSAGE, StorePersona } from "./store-policies";

/** A scripted "model": returns the queued replies in order and records each request. */
function scripted(...replies: (Partial<ChatReply> | null)[]) {
  const calls: GenerateRequest[] = [];
  const generate: Generate = async (request) => {
    calls.push(request);
    const next = replies[calls.length - 1];
    return {
      reply:
        next === null || next === undefined
          ? null
          : { intent: "stok", reply: "", sources: [], confidence: 0.9, escalate: false, ...next },
      engine: "llm",
      model: "test-model",
      runId: `run-${calls.length}`,
    };
  };
  return { generate, calls };
}

const question = "serum vit c ready? bisa COD?";
const ctx = glowContext(question);
const vitC = ctx.cards.find((c) => c.name === "Serum Vit C 20ml")!;
const good: Partial<ChatReply> = {
  reply: "Serum Vit C 20ml ready Kak, harganya Rp89.000. COD bisa.",
  sources: [
    { type: "product", id: vitC.variant_id },
    { type: "policy", id: "cod" },
  ],
};

describe("runTurn", () => {
  it("only stores the message when a human has taken over", async () => {
    const { generate, calls } = scripted(good);
    expect(await runTurn({ text: question, mode: "human", context: ctx }, generate)).toEqual({ action: "store_only", attempts: [] });
    expect(calls).toHaveLength(0);
  });

  it("escalates pre-routed messages without calling the model", async () => {
    const { generate, calls } = scripted(good);
    const outcome = await runTurn({ text: "kasih diskon dong", mode: "ai", context: ctx }, generate);
    expect(outcome).toMatchObject({ action: "escalate", cause: "negotiation", preRoute: "negotiation" });
    expect(calls).toHaveLength(0);
  });

  it("sends a reply that passes the guardrails", async () => {
    const { generate } = scripted(good);
    const outcome = await runTurn({ text: question, mode: "ai", context: ctx }, generate);
    expect(outcome).toMatchObject({ action: "reply", text: good.reply, engine: "llm" });
    if (outcome.action === "reply") expect(outcome.attempts[0]).toMatchObject({ runId: "run-1", model: "test-model" });
  });

  it("regenerates once with feedback after a wrong price, then sends the fixed reply", async () => {
    const { generate, calls } = scripted({ ...good, reply: "Serum Vit C 20ml ready Kak, harganya Rp85.000." }, good);
    const outcome = await runTurn({ text: question, mode: "ai", context: ctx }, generate);
    expect(outcome.action).toBe("reply");
    expect(calls).toHaveLength(2);
    expect(calls[1].attempt).toBe(1);
    expect(calls[1].feedback).toContain("85000");
  });

  it("escalates when the regenerated reply is still wrong (no third try)", async () => {
    const wrong = { ...good, reply: "Serum Vit C 20ml ready Kak, harganya Rp85.000." };
    const { generate, calls } = scripted(wrong, wrong, good);
    const outcome = await runTurn({ text: question, mode: "ai", context: ctx }, generate);
    expect(outcome).toMatchObject({ action: "escalate", cause: "price_mismatch", unsafe: false });
    expect(calls).toHaveLength(2);
  });

  it("blocks an unsafe reply: holding message sent, flagged unsafe, no regeneration", async () => {
    const { generate, calls } = scripted({ ...good, reply: "HPP-nya Rp38.000, jadi untung kami tipis." }, good);
    const outcome = await runTurn({ text: question, mode: "ai", context: ctx }, generate);
    expect(outcome).toMatchObject({ action: "escalate", cause: "unsafe", unsafe: true });
    if (outcome.action === "escalate") expect(outcome.text).toBe(ctx.persona.holding_message);
    expect(calls).toHaveLength(1);
  });

  it("escalates when the model output could not be parsed", async () => {
    const { generate } = scripted(null);
    expect(await runTurn({ text: question, mode: "ai", context: ctx }, generate)).toMatchObject({ action: "escalate", cause: "other" });
  });

  it("falls back to the default holding message if the stored one is unsafe", async () => {
    const persona = StorePersona.parse({});
    const bad = { ...ctx, persona: { ...persona, holding_message: "Modal habis, tunggu ya" } };
    const outcome = await runTurn({ text: "minta admin", mode: "ai", context: bad }, scripted().generate);
    if (outcome.action === "escalate") expect(outcome.text).toBe(DEFAULT_HOLDING_MESSAGE);
  });
});

describe("runTurn — a throwing generator (D6 T8)", () => {
  it("ends in the holding message, never an unguarded reply", async () => {
    const generate: Generate = async () => {
      throw new Error("boom");
    };
    const out = await runTurn({ text: question, mode: "ai", context: ctx }, generate);
    expect(out).toMatchObject({ action: "escalate", cause: "other", unsafe: false });
    expect(out.action === "escalate" && out.text).toBe(ctx.persona.holding_message || DEFAULT_HOLDING_MESSAGE);
    expect(out.attempts[0]).toMatchObject({ reply: null, error: "boom" });
  });
});

describe("runTurn time budget (< 10 detik per pesan, PDF §C.3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A "model" that answers each attempt after the given delay (ms); Infinity never answers. */
  function slow(delays: number[], replies: Partial<ChatReply>[]) {
    const calls: GenerateRequest[] = [];
    const generate: Generate = (request) => {
      calls.push(request);
      const i = calls.length - 1;
      return new Promise((resolve) => {
        if (!Number.isFinite(delays[i])) return;
        setTimeout(
          () =>
            resolve({
              reply: { intent: "stok", reply: "", sources: [], confidence: 0.9, escalate: false, ...replies[i] },
              engine: "llm",
              model: "test-model",
            }),
          delays[i],
        );
      });
    };
    return { generate, calls };
  }
  const wrongPrice = { ...good, reply: "Serum Vit C 20ml ready Kak, harganya Rp85.000." };

  it("the whole turn budget stays under 10 seconds", () => {
    expect(TURN_BUDGET_MS).toBeLessThan(10_000);
    expect(MIN_ATTEMPT_MS).toBeGreaterThan(0);
  });

  it("a first attempt that never answers ends in the holding message within the budget", async () => {
    const { generate, calls } = slow([Infinity], [good]);
    const started = Date.now();
    let outcome: Awaited<ReturnType<typeof runTurn>> | undefined;
    void runTurn({ text: question, mode: "ai", context: ctx }, generate).then((o) => (outcome = o));
    await vi.advanceTimersByTimeAsync(TURN_BUDGET_MS);
    expect(outcome).toMatchObject({ action: "escalate", text: ctx.persona.holding_message || DEFAULT_HOLDING_MESSAGE, cause: "other" });
    expect(outcome!.attempts).toHaveLength(1);
    expect(outcome!.attempts[0].error).toBe("turn_timeout");
    expect(Date.now() - started).toBeLessThanOrEqual(TURN_BUDGET_MS);
    // The generator is told how long it may take, never more than the budget.
    expect(calls[0].timeoutMs).toBeLessThanOrEqual(TURN_BUDGET_MS);
  });

  it("does not start the regeneration when too little time is left", async () => {
    const { generate, calls } = slow([TURN_BUDGET_MS - MIN_ATTEMPT_MS + 1, 0], [wrongPrice, good]);
    const started = Date.now();
    let outcome: Awaited<ReturnType<typeof runTurn>> | undefined;
    void runTurn({ text: question, mode: "ai", context: ctx }, generate).then((o) => (outcome = o));
    await vi.advanceTimersByTimeAsync(TURN_BUDGET_MS);
    expect(calls).toHaveLength(1);
    expect(outcome).toMatchObject({ action: "escalate", text: ctx.persona.holding_message || DEFAULT_HOLDING_MESSAGE, cause: "price_mismatch" });
    expect(Date.now() - started).toBeLessThanOrEqual(TURN_BUDGET_MS);
  });

  it("regenerates when there is time, with only the remaining budget", async () => {
    const { generate, calls } = slow([1_000, 500], [wrongPrice, good]);
    let outcome: Awaited<ReturnType<typeof runTurn>> | undefined;
    void runTurn({ text: question, mode: "ai", context: ctx }, generate).then((o) => (outcome = o));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(2);
    expect(calls[1].timeoutMs).toBeLessThanOrEqual(TURN_BUDGET_MS - 1_000);
    expect(outcome).toMatchObject({ action: "reply", text: good.reply });
  });
});
