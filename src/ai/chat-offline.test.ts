import { describe, expect, it } from "vitest";
import { DEMO_QUESTIONS } from "@/core/chat/fixtures/demo-questions";
import { glowContext } from "@/core/chat/fixtures/glow-by-sari";
import { runTurn } from "@/core/chat/pipeline";
import { findForbiddenTerms } from "@/core/chat/text";
import { chatGenerator } from "./chat-generator";
import { createAi } from "./run";

/**
 * The 15 demo questions end to end through the real AI layer with no API key:
 * `ai.run("chat_reply")` must route to the offline engine, label every
 * attempt as offline, and the turn outcomes must match the demo expectations.
 */
describe("15 pertanyaan demo via ai.run() tanpa kunci API", () => {
  const generate = chatGenerator(createAi({ env: {}, providers: {} }));

  for (const [question, expected] of DEMO_QUESTIONS) {
    it(question, async () => {
      const outcome = await runTurn({ text: question, mode: "ai", context: glowContext(question) }, generate);
      expect(outcome.action).toBe(expected.reply ? "reply" : "escalate");
      if (outcome.action === "store_only") return;
      expect(findForbiddenTerms(outcome.text)).toEqual([]);
      for (const attempt of outcome.attempts) {
        expect(attempt).toMatchObject({ engine: "offline", model: "offline:template-v1" });
        expect(attempt.meter).toMatchObject({ fallbackReason: "no_api_key", costIdr: "0.00" });
      }
      if (expected.reply && outcome.action === "reply") {
        for (const fragment of expected.includes) expect(outcome.text).toContain(fragment);
      }
      if (!expected.reply && outcome.action === "escalate") expect(outcome.cause).toBe(expected.cause);
    });
  }

  it("a failing route still escalates instead of crashing", async () => {
    const broken = chatGenerator({
      run: async () => {
        throw new Error("boom");
      },
    });
    const outcome = await runTurn({ text: "serum vit c ready?", mode: "ai", context: glowContext("serum vit c ready?") }, broken);
    expect(outcome).toMatchObject({ action: "escalate", cause: "other" });
  });
});
