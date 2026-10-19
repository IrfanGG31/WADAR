import { describe, expect, it } from "vitest";
import { conversationChip, escalationLabel, faqDraftFrom, inboxTab, OwnerReplyInput } from "./inbox";

describe("inbox helpers", () => {
  it("labels the chip from mode and status", () => {
    expect(conversationChip("human", "escalated").label).toBe("Belum bisa dijawab");
    expect(conversationChip("human", "open").label).toBe("Dibalas admin");
    expect(conversationChip("ai", "open").label).toBe("Dijawab AI");
    expect(conversationChip("ai", "closed").label).toBe("Selesai");
  });

  it("puts escalated conversations in the 'belum' tab", () => {
    expect(inboxTab("escalated")).toBe("belum");
    expect(inboxTab("open")).toBe("utama");
  });

  it("knows an unknown escalation reason as 'other'", () => {
    expect(escalationLabel("price_mismatch")).toBe("Harga tidak cocok dengan katalog");
    expect(escalationLabel("aneh")).toBe("Perlu dicek admin");
    expect(escalationLabel(null)).toBeNull();
  });

  it("validates owner replies", () => {
    expect(OwnerReplyInput.safeParse({ text: "  Siap Kak, kami kirim hari ini.  " })).toMatchObject({ success: true, data: { text: "Siap Kak, kami kirim hari ini." } });
    expect(OwnerReplyInput.safeParse({ text: "   " }).success).toBe(false);
    expect(OwnerReplyInput.safeParse({ text: "x".repeat(701) }).success).toBe(false);
    expect(OwnerReplyInput.safeParse({ text: "Modalnya cuma 38rb Kak" }).success).toBe(false);
  });
});

import { StoreProfileInput } from "./store-policies";

describe("StoreProfileInput", () => {
  const ok = { policies: { hours: "Setiap hari 09.00–20.00", cod: { available: true, note: "" } }, persona: { name: "Sari" } };

  it("fills defaults for a minimal form", () => {
    const r = StoreProfileInput.safeParse(ok);
    expect(r.success && r.data.policies.shipping_estimates).toEqual([]);
    expect(r.success && r.data.persona.salutation).toBe("Kak");
  });

  it("rejects internal-data words in buyer-facing text", () => {
    const r = StoreProfileInput.safeParse({ ...ok, policies: { ...ok.policies, promo: "Diskon besar, margin tipis" } });
    expect(r.success).toBe(false);
  });

  it("rejects a shipping estimate whose max is below its min", () => {
    const r = StoreProfileInput.safeParse({ ...ok, policies: { shipping_estimates: [{ area: "Jawa", cost_min: 20000, cost_max: 10000 }] } });
    expect(r.success).toBe(false);
  });
});

describe("faqDraftFrom (CHT-7)", () => {
  const msgs = [
    { id: "1", author: "customer" as const, content: "  Bisa COD ke Bekasi?  " },
    { id: "2", author: "system" as const, content: "Diambil alih" },
    { id: "3", author: "human" as const, content: "Bisa kak, ongkir Rp10.000." },
    { id: "4", author: "customer" as const, content: "Oke" },
  ];
  it("pairs the buyer question with the next AI/admin reply", () => {
    expect(faqDraftFrom(msgs, "1")).toEqual({ question: "Bisa COD ke Bekasi?", answer: "Bisa kak, ongkir Rp10.000." });
  });
  it("leaves the answer empty when nobody replied yet, and refuses non-buyer messages", () => {
    expect(faqDraftFrom(msgs, "4")).toEqual({ question: "Oke", answer: "" });
    expect(faqDraftFrom(msgs, "3")).toBeNull();
    expect(faqDraftFrom(msgs, "x")).toBeNull();
  });
});
