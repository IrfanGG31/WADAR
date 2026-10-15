import { describe, expect, it } from "vitest";
import { allowedAmounts, contextSourceIds, estimateTokens, renderStoreData, retrieveContext } from "./context";
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
