import { describe, expect, it } from "vitest";
import { conversationChip, escalationLabel, inboxTab, OwnerReplyInput } from "./inbox";

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
