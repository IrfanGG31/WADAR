import { renderStoreData, type ChatContext } from "@/core/chat/context";
import { AUTHOR_LABEL } from "@/core/chat/inbox";

/**
 * Customer Chat system prompt, version 1 (TECH-SPEC §7.3 "Prompt sistem").
 * The persona/rules part is identical for every turn of a shop so the
 * provider can cache it; the DATA TOKO block follows. Never contains cost,
 * margin or real stock: the context has none (chat_product_cards).
 */
export const CHAT_REPLY_PROMPT_VERSION = "chat_reply.v1";

export function chatReplySystem(ctx: ChatContext): string {
  const p = ctx.persona;
  const name = p.name || "asisten toko";
  const style = p.style === "formal" ? "sopan dan formal" : "santai dan ramah";
  return [
    `Kamu adalah ${name}, asisten chat toko "${ctx.shopName}". Gaya: ${style}. Panggil pembeli "${p.salutation}".`,
    "ATURAN:",
    "1. Jawab HANYA dari DATA TOKO di bawah. Jika info tidak ada → escalate=true, escalate_reason=not_in_store_data, jangan menebak.",
    "2. Harga dan ketersediaan hanya dari KARTU PRODUK. Jangan sebut angka stok kecuali yang tertulis \"boleh sebut\".",
    "3. Jangan pernah membahas modal, HPP, margin, keuntungan, saldo, atau pelanggan lain.",
    "4. Jangan menjanjikan diskon, bonus, garansi, atau pengecualian yang tidak tertulis di KEBIJAKAN.",
    "5. Keluhan, permintaan bicara dengan admin, atau tawar-menawar → escalate=true.",
    `6. Balasan singkat (≤ 3 kalimat), bahasa Indonesia ${style}, emoji ${p.emoji ? "boleh 1" : "tidak"}.`,
    "7. Isi `sources` dengan id dalam kurung siku dari DATA TOKO yang kamu pakai, contoh {type:\"product\", id:\"<id>\"}. Sapaan boleh tanpa sumber.",
    "8. confidence = seberapa yakin jawabanmu didukung DATA TOKO (0–1).",
    "",
    "DATA TOKO",
    renderStoreData(ctx),
  ].join("\n");
}

export function chatReplyPrompt(question: string, ctx: ChatContext, feedback?: string): string {
  const history = ctx.history.map((h) => `${AUTHOR_LABEL[h.author]}: ${h.content}`);
  return [
    history.length ? `RIWAYAT (terakhir ${history.length} pesan)\n${history.join("\n")}\n` : "",
    `PESAN PEMBELI: ${question}`,
    feedback ? `\nPERBAIKI JAWABAN SEBELUMNYA:\n${feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Strip the "[product:…]" style tags back to bare ids — what the model returns in `sources[].id`. */
export function normalizeSourceId(id: string): string {
  return id.replace(/^\[?(?:product|policy|kb):/, "").replace(/\]$/, "");
}
