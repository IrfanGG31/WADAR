import { describe, expect, it } from "vitest";
import {
  allowedAmounts,
  CONTEXT_TOKEN_BUDGET,
  contextSourceIds,
  estimateTokens,
  fitTokenBudget,
  renderStoreData,
  retrieveContext,
  type RetrieveInput,
} from "./context";
import { fuseKb, rankProductCards, type KbCandidate } from "./retrieval";
import type { ProductCard } from "./schema";
import { GLOW_CARDS, GLOW_PERSONA, GLOW_POLICIES, glowContext } from "./fixtures/glow-by-sari";
import { classifyIntentOffline } from "./offline-reply";
import { formatShippingEstimate, parsePersona, parsePolicies, policyFacts, StorePersona, StorePolicies } from "./store-policies";

describe("retrieveContext", () => {
  it("keeps ≤ 5 cards, ≤ 3 KB snippets and the last 6 turns", () => {
    const history = Array.from({ length: 9 }, (_, i) => ({ author: "customer" as const, content: `pesan ${i}` }));
    const ctx = glowContext("serum ada apa aja?", history);
    expect(ctx.cards.length).toBeLessThanOrEqual(5);
    expect(ctx.kb.length).toBeLessThanOrEqual(3);
    expect(ctx.history.map((h) => h.content)).toEqual(["pesan 3", "pesan 4", "pesan 5", "pesan 6", "pesan 7", "pesan 8"]);
  });

  it("works with an empty shop", () => {
    const ctx = retrieveContext({
      message: "halo",
      shopName: "Toko Baru",
      persona: StorePersona.parse({}),
      policies: StorePolicies.parse({}),
      allCards: [],
      kbCandidates: [],
    });
    expect(ctx.cards).toEqual([]);
    expect(renderStoreData(ctx)).toContain("(belum diisi)");
  });
});

describe("renderStoreData (the prompt's DATA TOKO)", () => {
  const ctx = glowContext("lip serum ada warna apa aja?");
  const data = renderStoreData(ctx);

  it("shows prices with formatRupiah, availability, and qty_hint only for 'sisa sedikit'", () => {
    expect(data).toContain("Lip Serum — Pink — Rp39.000 — tersedia");
    expect(data).toContain("Lip Serum — Berry — Rp39.000 — sisa sedikit (boleh sebut: sisa 2)");
  });

  it("carries no cost, margin or real stock — the card type has none to give", () => {
    expect(data).not.toMatch(/hpp|modal|margin|avg_cost|on_hand/i);
    // Hyaluronic Toner has 30 on hand; the number must not appear anywhere.
    const toner = renderStoreData(glowContext("hyaluronic toner ready?"));
    expect(toner).toContain("Hyaluronic Toner 100ml — Rp65.000 — tersedia");
    expect(toner).not.toMatch(/\b30\b/);
  });

  it("tags every line with the source id the reply must cite", () => {
    const ids = contextSourceIds(ctx);
    expect(ids.has(`product:${ctx.cards[0].variant_id}`)).toBe(true);
    expect(ids.has("policy:cod")).toBe(true);
    for (const id of ids) expect(data).toContain(`[${id}]`);
  });

  it("stays inside the chat_reply input budget (≤ 2.200 tokens incl. ±350 system)", () => {
    expect(estimateTokens(data)).toBeLessThan(1800);
  });
});

describe("allowedAmounts", () => {
  it("is card prices + policy amounts", () => {
    const amounts = allowedAmounts(glowContext("serum vit c ready?"));
    expect(amounts.has(89_000)).toBe(true);
    expect(amounts.has(12_000)).toBe(true); // ongkir Pulau Jawa min
    expect(amounts.has(250_000)).toBe(true); // promo minimum
    expect(amounts.has(38_000)).toBe(false); // the HPP of Serum Vit C
  });
});

describe("store policies & persona (KB-1, CHT-3)", () => {
  it("parses the demo policies and lists them as facts", () => {
    expect(policyFacts(GLOW_POLICIES).map((f) => f.key)).toEqual([
      "hours",
      "address",
      "shipping_areas",
      "shipping_estimates",
      "cod",
      "payment_methods",
      "returns",
      "warranty",
      "processing_time",
      "order_steps",
      "admin_contact",
      "promo",
    ]);
  });

  it("formats shipping estimates with formatRupiah", () => {
    expect(formatShippingEstimate(GLOW_POLICIES.shipping_estimates[1])).toBe("Pulau Jawa Rp12.000–Rp25.000 (2–4 hari)");
    expect(formatShippingEstimate({ area: "Kota", cost_min: 10_000, cost_max: 10_000, eta: "", keywords: [] })).toBe("Kota Rp10.000");
  });

  it("rejects a max below the min and non-integer rupiah", () => {
    const bad = { shipping_estimates: [{ area: "Jawa", cost_min: 20_000, cost_max: 10_000 }] };
    expect(StorePolicies.safeParse(bad).success).toBe(false);
    expect(StorePolicies.safeParse({ shipping_estimates: [{ area: "Jawa", cost_min: 1.5, cost_max: 2 }] }).success).toBe(false);
  });

  it("falls back to defaults for an unreadable row instead of breaking chat", () => {
    expect(parsePolicies({ hours: 42 })).toEqual(StorePolicies.parse({}));
    expect(parsePersona(null).salutation).toBe("Kak");
    expect(parsePersona(GLOW_PERSONA).name).toBe("Sari");
  });

  it("refuses a holding message that mentions internal numbers", () => {
    expect(StorePersona.safeParse({ holding_message: "Sebentar, admin cek modal dulu" }).success).toBe(false);
  });
});

describe("classifyIntentOffline (the offline `intent` task)", () => {
  it.each([
    ["Halo kak", "sapaan"],
    ["serum vit c ready?", "stok"],
    ["harga serum berapa?", "harga"],
    ["ongkir ke surabaya berapa?", "ongkir_kirim"],
    ["bisa cod?", "pembayaran"],
    ["jam buka?", "jam_lokasi"],
    ["bisa retur?", "retur_garansi"],
    ["cara pesannya gimana?", "cara_pesan"],
    ["resi pesanan saya mana?", "status_pesanan"],
    ["modal kamu berapa?", "di_luar_cakupan"],
    ["cuaca hari ini?", "di_luar_cakupan"],
  ])("%s → %s", (text, intent) => {
    expect(classifyIntentOffline(text)).toBe(intent);
  });

  it("covers every demo card name without crashing", () => {
    for (const card of GLOW_CARDS) expect(classifyIntentOffline(`${card.name} ready?`)).toBe("stok");
  });
});

describe("RAG context budget (±1.800 token, PDF §C.1)", () => {
  const card = (i: number, description: string): ProductCard => ({
    variant_id: `v${i}`,
    name: `Serum ${"ABCDE"[i]}`,
    option_label: null,
    category: "Serum",
    description,
    price: 50_000 + i * 1_000,
    availability: "tersedia",
    qty_hint: 0,
  });
  const kb = (i: number, content: string): KbCandidate => ({ id: `k${i}`, kind: "doc", content, vec_rank: i + 1, txt_rank: i + 1 });
  const input = (cardText: number, kbText: number): RetrieveInput => ({
    message: "serum",
    shopName: "Toko",
    persona: StorePersona.parse({}),
    policies: GLOW_POLICIES,
    allCards: [0, 1, 2, 3, 4].map((i) => card(i, `Deskripsi serum ${i}. ${"kandungan niacinamide ".repeat(cardText)}`)),
    kbCandidates: [0, 1, 2].map((i) => kb(i, `Dokumen ${i}: ${"cara pakai serum pagi dan malam ".repeat(kbText)}`)),
  });

  it("5 large cards + 3 large KB chunks are trimmed to ≤ 1.800 tokens", () => {
    expect(CONTEXT_TOKEN_BUDGET).toBe(1_800);
    const big = input(40, 60);
    const untrimmed = renderStoreData({ ...retrieveContext(big), cards: rankProductCards(big.message, big.allCards), kb: fuseKb(big.kbCandidates).snippets });
    expect(estimateTokens(untrimmed)).toBeGreaterThan(CONTEXT_TOKEN_BUDGET);
    const ctx = retrieveContext(big);
    expect(estimateTokens(renderStoreData(ctx))).toBeLessThanOrEqual(CONTEXT_TOKEN_BUDGET);
    expect(ctx.cards.length + ctx.kb.length).toBeGreaterThan(0);
    // Whole items are dropped, never cut mid-text.
    for (const k of ctx.kb) expect(big.kbCandidates.find((c) => c.id === k.id)?.content).toBe(k.content);
    for (const c of ctx.cards) expect(big.allCards.find((x) => x.variant_id === c.variant_id)).toEqual(c);
  });

  it("a small context is not trimmed", () => {
    const small = input(1, 1);
    const ctx = retrieveContext(small);
    expect(ctx.cards.map((c) => c.variant_id)).toEqual(rankProductCards(small.message, small.allCards).map((c) => c.variant_id));
    expect(ctx.kb.map((k) => k.id)).toEqual(["k0", "k1", "k2"]);
    expect(ctx.retrievalScore).toBe(fuseKb(small.kbCandidates).retrievalScore);
    const glow = glowContext("serum ada apa aja?");
    expect(fitTokenBudget(glow)).toEqual(glow);
  });

  it("drops the least relevant item first and keeps relevance order", () => {
    const ctx = retrieveContext(input(1, 1));
    const full = estimateTokens(renderStoreData(ctx));
    // Room for everything but one item: the 5th card (rank 5) goes before the 3rd KB chunk (rank 3).
    const one = fitTokenBudget(ctx, full - 1);
    expect(one.cards.map((c) => c.variant_id)).toEqual(ctx.cards.slice(0, 4).map((c) => c.variant_id));
    expect(one.kb).toEqual(ctx.kb);
    // Tighter: survivors are always the top of each ranked list, in the same order.
    for (let budget = full - 1; budget > 0; budget -= 25) {
      const t = fitTokenBudget(ctx, budget);
      expect(t.cards).toEqual(ctx.cards.slice(0, t.cards.length));
      expect(t.kb).toEqual(ctx.kb.slice(0, t.kb.length));
    }
  });

  it("no KB chunk left → retrievalScore 0 (nothing retrieved backs an answer)", () => {
    const ctx = retrieveContext(input(1, 1));
    const t = fitTokenBudget(ctx, 1);
    expect(t.kb).toEqual([]);
    expect(t.cards).toEqual([]);
    expect(t.retrievalScore).toBe(0);
  });
});
