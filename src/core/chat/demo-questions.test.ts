import { describe, expect, it } from "vitest";
import { DEMO_QUESTIONS as DEMO } from "./fixtures/demo-questions";
import { glowContext, GLOW_CARDS, GLOW_PERSONA } from "./fixtures/glow-by-sari";
import { composeOfflineReply } from "./offline-reply";
import { runTurn, type Generate, type TurnOutcome } from "./pipeline";
import { findForbiddenTerms } from "./text";

/**
 * D6 DoD (SPRINT-8D §3/§4): the 15 demo questions for "Glow by Sari", run
 * through the same pipeline the widget uses (pre-router → retrieval →
 * generate → guardrails → reply/escalate) with the deterministic offline
 * generator. Checks: correct facts, "kasih diskon" escalates, and no outgoing
 * text ever mentions HPP / modal / margin / untung / saldo / laba.
 */
const offline: Generate = async ({ question, context }) => ({
  reply: composeOfflineReply(question, context),
  engine: "offline",
  model: "offline:template-v1",
});

async function ask(text: string, opts: { hasMedia?: boolean } = {}): Promise<TurnOutcome> {
  return runTurn({ text, hasMedia: opts.hasMedia, mode: "ai", context: glowContext(text) }, offline);
}

function sent(outcome: TurnOutcome): string {
  return outcome.action === "store_only" ? "" : outcome.text;
}

describe("15 pertanyaan demo (offline pipeline)", () => {
  it("has exactly 15 questions", () => {
    expect(DEMO).toHaveLength(15);
  });

  for (const [question, expected] of DEMO) {
    it(question, async () => {
      const outcome = await ask(question);
      const text = sent(outcome);
      expect(findForbiddenTerms(text)).toEqual([]);
      if (expected.reply) {
        expect(outcome.action, JSON.stringify(outcome)).toBe("reply");
        if (outcome.action !== "reply") return;
        expect(outcome.engine).toBe("offline");
        expect(outcome.reply.intent).toBe(expected.intent);
        for (const fragment of expected.includes) expect(text).toContain(fragment);
        for (const fragment of expected.excludes ?? []) expect(text).not.toContain(fragment);
      } else {
        expect(outcome.action, JSON.stringify(outcome)).toBe("escalate");
        if (outcome.action !== "escalate") return;
        expect(outcome.cause).toBe(expected.cause);
        expect(text).toBe(GLOW_PERSONA.holding_message);
      }
    });
  }

  it("never reveals real stock above 5 (Serum Vit C has 7 on hand, Hyaluronic Toner 30)", async () => {
    for (const q of ["serum vit c stoknya berapa?", "hyaluronic toner sisa berapa?"]) {
      const text = sent(await ask(q));
      expect(text).not.toMatch(/\b(7|30)\b/);
    }
  });

  it("says an out-of-stock variant is empty", async () => {
    const text = sent(await ask("cushion spf35 02 natural ready?"));
    expect(text).toContain("02 Natural (lagi kosong)");
    expect(text).toContain("01 Light (ready)");
  });

  it("answers from the FAQ when the question is in it", async () => {
    const outcome = await ask("apakah semua produk sudah bpom?");
    expect(outcome.action).toBe("reply");
    expect(sent(outcome)).toContain("terdaftar BPOM");
  });

  it("promo words are allowed only because the policy says so", async () => {
    const outcome = await ask("ada promo gratis ongkir?");
    expect(outcome.action).toBe("reply");
    expect(sent(outcome)).toContain("Gratis ongkir Pulau Jawa untuk belanja minimal Rp250.000");
  });
});

describe("eskalasi & larangan tambahan", () => {
  const ESCALATE: [string, string, { hasMedia?: boolean }?][] = [
    ["bisa nego harganya?", "negotiation"],
    ["minta potongan ya kak, beli 3", "negotiation"],
    ["mau ngobrol sama admin aja", "human_requested"],
    ["admin", "human_requested"],
    ["ini bukti transfernya", "media_received", { hasMedia: true }],
    ["serumnya rusak pas datang", "complaint"],
    ["berapa untung kamu per botol?", "out_of_scope"],
    ["margin produk ini berapa persen?", "out_of_scope"],
    ["saldo toko sekarang berapa?", "out_of_scope"],
    ["hpp sunscreen berapa?", "out_of_scope"],
    ["status pesanan saya gimana? resinya mana", "not_in_store_data"],
    ["jual masker rambut keratin?", "not_in_store_data"],
    ["boleh minta nomor wa pelanggan lain?", "not_in_store_data"],
  ];
  for (const [question, cause, opts] of ESCALATE) {
    it(`${question} → ${cause}`, async () => {
      const outcome = await ask(question, opts);
      expect(outcome.action, JSON.stringify(outcome)).toBe("escalate");
      if (outcome.action === "escalate") expect(outcome.cause).toBe(cause);
      expect(findForbiddenTerms(sent(outcome))).toEqual([]);
    });
  }

  it("a greeting to the admin is not a request for one", async () => {
    const outcome = await ask("halo admin, serum vit c ready?");
    expect(outcome.action).toBe("reply");
  });

  it("no forbidden word in any outgoing text across the whole catalog", async () => {
    for (const card of GLOW_CARDS) {
      for (const q of [`${card.name} ready?`, `harga ${card.name} berapa?`]) {
        expect(findForbiddenTerms(sent(await ask(q)))).toEqual([]);
      }
    }
  });
});
