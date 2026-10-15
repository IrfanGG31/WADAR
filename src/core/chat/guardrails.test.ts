import { describe, expect, it } from "vitest";
import { glowContext } from "./fixtures/glow-by-sari";
import { checkReply, isSafeOutgoing } from "./guardrails";
import type { ChatReply } from "./schema";

const ctx = glowContext("serum vit c ready? bisa COD?");
const vitC = ctx.cards.find((c) => c.name === "Serum Vit C 20ml")!;

function reply(partial: Partial<ChatReply> = {}): ChatReply {
  return {
    intent: "stok",
    reply: "Serum Vit C 20ml ready Kak, harganya Rp89.000.",
    sources: [{ type: "product", id: vitC.variant_id }],
    confidence: 0.9,
    escalate: false,
    ...partial,
  };
}

describe("checkReply — spec order (TECH-SPEC §7.3 step 5)", () => {
  it("passes a grounded reply", () => {
    expect(checkReply(reply(), ctx, 0)).toMatchObject({ verdict: "pass", violations: [], unsafe: false });
  });

  describe("1. model escalation / confidence / scope", () => {
    it("escalates when the model asks to, with its reason", () => {
      const r = checkReply(reply({ escalate: true, escalate_reason: "negotiation" }), ctx, 0);
      expect(r).toMatchObject({ verdict: "escalate", cause: "negotiation" });
    });

    it("escalates below confidence 0.6 (0.6 itself passes)", () => {
      expect(checkReply(reply({ confidence: 0.59 }), ctx, 0)).toMatchObject({ verdict: "escalate", cause: "low_confidence" });
      expect(checkReply(reply({ confidence: 0.6 }), ctx, 0).verdict).toBe("pass");
    });

    it("escalates di_luar_cakupan", () => {
      expect(checkReply(reply({ intent: "di_luar_cakupan" }), ctx, 0)).toMatchObject({ verdict: "escalate", cause: "out_of_scope" });
    });
  });

  describe("2. harga", () => {
    it("asks for one regeneration on an amount that is not in the cards or policies", () => {
      const r = checkReply(reply({ reply: "Serum Vit C 20ml ready Kak, harganya Rp85.000." }), ctx, 0);
      expect(r.verdict).toBe("regenerate");
      expect(r.violations).toEqual([{ rule: "price", detail: "85000" }]);
      expect(r.feedback).toContain("85000");
    });

    it("escalates when the regenerated reply is still wrong", () => {
      const r = checkReply(reply({ reply: "Harganya 85rb aja Kak." }), ctx, 1);
      expect(r).toMatchObject({ verdict: "escalate", cause: "price_mismatch" });
    });

    it("accepts policy amounts (ongkir, promo minimum) in any spelling", () => {
      const text = "Ongkir Pulau Jawa 12rb–25rb, gratis ongkir kalau belanja minimal Rp250.000.";
      const r = checkReply(reply({ intent: "ongkir_kirim", reply: text, sources: [{ type: "policy", id: "shipping_estimates" }] }), ctx, 0);
      expect(r.verdict).toBe("pass");
    });
  });

  describe("3. stok", () => {
    it("rejects a stock number above qty_hint (real stock is 7, hint is 5)", () => {
      const r = checkReply(reply({ reply: "Serum Vit C 20ml sisa 7 Kak, harganya Rp89.000." }), ctx, 0);
      expect(r.verdict).toBe("regenerate");
      expect(r.violations[0]).toMatchObject({ rule: "stock" });
    });

    it("rejects 'ready' for a sold-out variant and 'habis' for an available one", () => {
      const natural = glowContext("cushion spf35 02 natural ready?");
      const cushion = natural.cards.find((c) => c.option_label === "02 Natural")!;
      const saysReady = reply({ reply: "Cushion SPF35 — 02 Natural ready Kak.", sources: [{ type: "product", id: cushion.variant_id }] });
      // Both Cushion variants are in context and mentioned by name, one ready one empty → ambiguous, allowed.
      expect(checkReply(saysReady, natural, 0).verdict).toBe("pass");

      const sheet = glowContext("sheet mask soothing ready?");
      const onlyEmpty = { ...sheet, cards: sheet.cards.filter((c) => c.option_label === "Soothing") };
      const r = checkReply(
        reply({ reply: "Sheet Mask Soothing ready Kak.", sources: [{ type: "product", id: onlyEmpty.cards[0].variant_id }] }),
        onlyEmpty,
        0,
      );
      expect(r.violations.map((v) => v.rule)).toContain("stock");

      expect(checkReply(reply({ reply: "Maaf Kak, Serum Vit C 20ml lagi habis." }), ctx, 0).violations[0]).toMatchObject({
        rule: "stock",
      });
    });

    it("does not read a product name as a stock count (Toner Pad 60 Lembar)", () => {
      const toner = glowContext("toner pad ada?");
      const pad = toner.cards.find((c) => c.name === "Toner Pad 60 Lembar")!;
      const r = checkReply(
        reply({ reply: "Toner Pad 60 Lembar ready Kak, harganya Rp89.000.", sources: [{ type: "product", id: pad.variant_id }] }),
        toner,
        0,
      );
      expect(r.verdict).toBe("pass");
    });
  });

  describe("4. larangan", () => {
    it.each([
      "HPP Serum Vit C Rp38.000 kok Kak.",
      "Modalnya kecil, jadi bisa murah.",
      "Margin kami tipis Kak.",
      "Untungnya cuma sedikit.",
      "Saldo toko lagi kosong.",
      "Laba kami per botol kecil.",
    ])("blocks, escalates and marks unsafe: %s", (text) => {
      const r = checkReply(reply({ reply: text }), ctx, 0);
      expect(r).toMatchObject({ verdict: "escalate", cause: "unsafe", unsafe: true });
    });

    it("is never regenerated, even on the first attempt with a price error too", () => {
      const r = checkReply(reply({ reply: "Harga modal Rp38.000, jual Rp85.000." }), ctx, 0);
      expect(r.verdict).toBe("escalate");
      expect(r.unsafe).toBe(true);
    });

    it("blocks someone else's phone number but allows the shop's and the buyer's", () => {
      expect(checkReply(reply({ reply: "Hubungi Bu Rina di 0813-1111-2222 ya." }), ctx, 0)).toMatchObject({
        cause: "unsafe",
        unsafe: true,
      });
      const shop = reply({ intent: "cara_pesan", reply: "Bisa WA admin di 0812-2700-3456 ya Kak.", sources: [{ type: "policy", id: "admin_contact" }] });
      expect(checkReply(shop, ctx, 0).verdict).toBe("pass");
      const buyerCtx = glowContext("nomor saya benar?", [], "+6285700001111");
      const buyer = reply({ intent: "cara_pesan", reply: "Nomor Kakak 0857-0000-1111 sudah kami catat.", sources: [{ type: "policy", id: "order_steps" }] });
      expect(checkReply(buyer, buyerCtx, 0).verdict).toBe("pass");
    });
  });

  describe("5. janji", () => {
    it.each(["diskon", "potongan", "garansi uang kembali", "cashback", "bonus"])(
      "escalates a promise not written in policies/KB: %s",
      (word) => {
        const noPromises = { ...ctx, policies: { ...ctx.policies, warranty: "", promo: "" } };
        const r = checkReply(reply({ reply: `Serum Vit C 20ml ready Kak, ada ${word} juga.` }), noPromises, 0);
        expect(r).toMatchObject({ verdict: "escalate", cause: "policy_exception" });
      },
    );

    it("allows a promise word that the policy itself uses", () => {
      const text = "Ada gratis ongkir Pulau Jawa untuk belanja minimal Rp250.000, dan garansi produk original.";
      const r = checkReply(reply({ intent: "harga", reply: text, sources: [{ type: "policy", id: "promo" }] }), ctx, 0);
      expect(r.verdict).toBe("pass");
    });
  });

  describe("6. sumber", () => {
    it("escalates not_in_store_data when a non-greeting reply cites nothing", () => {
      expect(checkReply(reply({ sources: [] }), ctx, 0)).toMatchObject({ verdict: "escalate", cause: "not_in_store_data" });
    });

    it("treats ids that are not in the context as no source", () => {
      expect(checkReply(reply({ sources: [{ type: "product", id: "made-up" }] }), ctx, 0).verdict).toBe("escalate");
    });

    it("lets a greeting go without sources", () => {
      expect(checkReply(reply({ intent: "sapaan", reply: "Halo Kak! Ada yang bisa dibantu?", sources: [] }), ctx, 0).verdict).toBe(
        "pass",
      );
    });
  });
});

describe("isSafeOutgoing", () => {
  it("flags any forbidden word", () => {
    expect(isSafeOutgoing("Halo Kak")).toBe(true);
    expect(isSafeOutgoing("HPP kami rahasia")).toBe(false);
  });
});

describe("audit hardening (D6 T1–T6)", () => {
  const both = glowContext("serum vit c 20ml dan hair mist 100ml");
  const [a, b] = [both.cards.find((c) => c.name === "Serum Vit C 20ml")!, both.cards.find((c) => c.name === "Hair Mist 100ml")!];
  const two = (overA: Partial<typeof a>, overB: Partial<typeof b>) => ({
    ...ctx,
    cards: [
      { ...a, ...overA },
      { ...b, ...overB },
    ],
  });
  const stockReply = (text: string): ChatReply =>
    reply({ reply: text, sources: [{ type: "product", id: a.variant_id }, { type: "product", id: b.variant_id }] });
  const stockViolations = (text: string, c: ReturnType<typeof two>) =>
    checkReply(stockReply(text), c, 1).violations.filter((v) => v.rule === "stock");

  describe("T1 stock number is bound to the product it sits next to", () => {
    const c = two({ qty_hint: 2, availability: "sisa_sedikit" }, { qty_hint: 5, availability: "sisa_sedikit" });
    it("rejects B's allowance applied to A", () => {
      expect(stockViolations("Serum Vit C 20ml stok 5, Hair Mist 100ml stok 5.", c)).toHaveLength(1);
      expect(stockViolations("Serum Vit C 20ml stok 5, Hair Mist 100ml stok 5.", c)[0].detail).toContain("Serum Vit C 20ml");
    });
    it("accepts each number within its own product's hint", () => {
      expect(stockViolations("Serum Vit C 20ml sisa 2, Hair Mist 100ml sisa 5.", c)).toEqual([]);
    });
    it("binds a number that comes before the name to the following product", () => {
      expect(stockViolations("Sisa 5 untuk Serum Vit C 20ml ya Kak.", c)).toHaveLength(1);
    });
  });

  describe("T4 availability words are checked per product", () => {
    it("rejects 'A ready, B habis' when A is habis and B is available", () => {
      const c = two({ availability: "habis", qty_hint: 0 }, { availability: "tersedia", qty_hint: 5 });
      expect(stockViolations("Serum Vit C 20ml masih ready, Hair Mist 100ml sudah habis.", c)).toHaveLength(2);
    });
    it("accepts the matching statement", () => {
      const c = two({ availability: "habis", qty_hint: 0 }, { availability: "tersedia", qty_hint: 5 });
      expect(stockViolations("Serum Vit C 20ml sudah habis, tapi Hair Mist 100ml masih ready.", c)).toEqual([]);
    });
    it("lets 'A dan B ready' share one claim", () => {
      const c = two({ availability: "habis", qty_hint: 0 }, { availability: "tersedia", qty_hint: 5 });
      expect(stockViolations("Serum Vit C 20ml dan Hair Mist 100ml ready Kak.", c)).toHaveLength(1);
    });
  });

  describe("T6 wider stock phrasings", () => {
    const c = two({ qty_hint: 2, availability: "sisa_sedikit" }, { qty_hint: 2, availability: "sisa_sedikit" });
    it.each(["Serum Vit C 20ml stok: 5", "Serum Vit C 20ml cuma 5 pcs", "Serum Vit C 20ml 5 pcs saja", "Serum Vit C 20ml sisa lima", "Serum Vit C 20ml tinggal dua belas"])(
      "catches %s",
      (text) => {
        expect(stockViolations(text, c)).toHaveLength(1);
      },
    );
    it("does not read sizes as stock", () => {
      expect(stockViolations("Serum Vit C 20ml stok 2, ukuran 30 ml ya.", c)).toEqual([]);
    });
  });

  describe("T5 promises are checked per claim", () => {
    it("treats 'ongkir gratis' as the 'gratis ongkir' claim", () => {
      const noPromises = { ...ctx, policies: { ...ctx.policies, promo: "", warranty: "" }, kb: [] };
      const r = checkReply(reply({ reply: "Ongkir gratis ke seluruh Jawa Kak." }), noPromises, 0);
      expect(r).toMatchObject({ verdict: "escalate", cause: "policy_exception" });
    });
    it("rejects a bigger number than the policy states", () => {
      const withPromo = { ...ctx, policies: { ...ctx.policies, promo: "Diskon 10% untuk member." } };
      expect(checkReply(reply({ reply: "Ada diskon 50% Kak." }), withPromo, 0)).toMatchObject({ cause: "policy_exception" });
      expect(checkReply(reply({ reply: "Ada diskon 10% untuk member Kak." }), withPromo, 0).verdict).toBe("pass");
    });
    it("a word elsewhere in the policy does not back a different claim", () => {
      const p = { ...ctx, policies: { ...ctx.policies, promo: "Bonus sticker untuk pembelian pertama.", warranty: "" }, kb: [] };
      expect(checkReply(reply({ reply: "Ada bonus 3 voucher Kak." }), p, 0)).toMatchObject({ cause: "policy_exception" });
    });
  });
});
