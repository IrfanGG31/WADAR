import { describe, expect, it } from "vitest";
import { conversationChip, escalationLabel } from "./inbox";
import { catalogChunk, FaqInput, faqChunk } from "./kb";
import { checkRateLimit, isValidSessionId, startsNewWindow, visitorLabel, WidgetMessageInput } from "./widget";

describe("checkRateLimit (10 messages / minute / session)", () => {
  const now = 1_000_000;
  it("allows up to 9 messages in the last minute", () => {
    const nine = Array.from({ length: 9 }, (_, i) => now - i * 1000);
    expect(checkRateLimit(nine, now)).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  it("limits the 11th attempt and says when to retry", () => {
    const ten = Array.from({ length: 10 }, (_, i) => now - 50_000 + i * 1000);
    expect(checkRateLimit(ten, now)).toEqual({ limited: true, retryAfterSeconds: 10 });
  });

  it("forgets messages older than the window", () => {
    const old = Array.from({ length: 20 }, (_, i) => now - 61_000 - i);
    expect(checkRateLimit(old, now).limited).toBe(false);
  });
});

describe("widget session & payload", () => {
  it("accepts only server-minted session ids", () => {
    expect(isValidSessionId("aB3_-xYz0123456789abcd")).toBe(true);
    expect(isValidSessionId("short")).toBe(false);
    expect(isValidSessionId("'; drop table messages; --aaaaaaaaaaaa")).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
  });

  it("validates the message payload", () => {
    expect(WidgetMessageInput.safeParse({ text: "  serum ready?  ", client_id: "m-12345678" }).data?.text).toBe("serum ready?");
    expect(WidgetMessageInput.safeParse({ text: "   ", client_id: "m-12345678" }).success).toBe(false);
    expect(WidgetMessageInput.safeParse({ text: "x".repeat(501), client_id: "m-12345678" }).success).toBe(false);
    expect(WidgetMessageInput.safeParse({ text: "hai", client_id: "bad id!" }).success).toBe(false);
  });

  it("starts a new 24-hour conversation window", () => {
    const now = Date.parse("2026-10-15T10:00:00Z");
    expect(startsNewWindow(null, now)).toBe(true);
    expect(startsNewWindow("2026-10-14T10:00:01Z", now)).toBe(false);
    expect(startsNewWindow("2026-10-14T10:00:00Z", now)).toBe(true);
  });

  it("names anonymous visitors", () => {
    expect(visitorLabel("ab3_xyz0123456789abcdef")).toBe("Pengunjung AB3X");
  });
});

describe("inbox wording", () => {
  it("labels escalations in Indonesian, unknown reasons as 'Perlu dicek admin'", () => {
    expect(escalationLabel("negotiation")).toBe("Minta diskon / tawar harga");
    expect(escalationLabel("unsafe")).toBe("Diblokir: menyebut data internal");
    expect(escalationLabel("something_new")).toBe("Perlu dicek admin");
    expect(escalationLabel(null)).toBeNull();
  });

  it("maps mode × status to a chip", () => {
    expect(conversationChip("ai", "open").label).toBe("Dijawab AI");
    expect(conversationChip("human", "escalated").label).toBe("Belum bisa dijawab");
    expect(conversationChip("human", "open").label).toBe("Dibalas admin");
    expect(conversationChip("ai", "closed").label).toBe("Selesai");
  });
});

describe("knowledge-base chunks", () => {
  it("one FAQ pair = one chunk", () => {
    const chunk = faqChunk({ question: "Apakah BPOM?", answer: "Iya Kak." });
    expect(chunk).toEqual({
      content: "Tanya: Apakah BPOM?\nJawab: Iya Kak.",
      metadata: { kind: "faq", question: "Apakah BPOM?", answer: "Iya Kak." },
    });
  });

  it("rejects FAQ answers that would leak internal numbers", () => {
    expect(FaqInput.safeParse({ question: "Kenapa murah?", answer: "Karena modal kami kecil" }).success).toBe(false);
    expect(FaqInput.safeParse({ question: "Apakah original?", answer: "Iya, original BPOM" }).success).toBe(true);
  });

  it("catalog chunks carry no price and no stock", () => {
    const chunk = catalogChunk({
      id: "p1",
      name: "Lip Serum",
      category: "Bibir",
      description: "Melembapkan bibir.",
      options: ["Pink", "Nude", null],
    });
    expect(chunk.content).toBe("Produk: Lip Serum\nKategori: Bibir\nPilihan: Pink, Nude\nDeskripsi: Melembapkan bibir.");
    expect(chunk.content).not.toMatch(/rp|\d/i);
    expect(chunk.metadata).toEqual({ kind: "catalog", product_id: "p1", name: "Lip Serum" });
  });
});
