import { z } from "zod";
import type { EscalationCause } from "./schema";
import { findForbiddenTerms } from "./text";
import { visitorLabel } from "./widget";

/** Inbox wording (CHT-6, CHT-7): status chips, escalation reasons, authors. */
export type ConversationMode = "ai" | "human";
export type ConversationStatus = "open" | "escalated" | "closed";
export type MessageAuthor = "customer" | "ai" | "human" | "system";

export const ESCALATION_LABEL: Record<EscalationCause, string> = {
  media_received: "Pembeli kirim gambar/dokumen",
  human_requested: "Pembeli minta bicara dengan admin",
  complaint: "Keluhan pembeli",
  negotiation: "Minta diskon / tawar harga",
  not_in_store_data: "Info tidak ada di data toko",
  policy_exception: "Di luar kebijakan toko",
  low_confidence: "AI kurang yakin",
  out_of_scope: "Di luar cakupan toko",
  price_mismatch: "Harga tidak cocok dengan katalog",
  stock_mismatch: "Info stok tidak cocok",
  unsafe: "Diblokir: menyebut data internal",
  other: "Perlu dicek admin",
};

export function escalationLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return (ESCALATION_LABEL as Record<string, string>)[reason] ?? ESCALATION_LABEL.other;
}

export interface StatusChip {
  label: string;
  tone: "success" | "warning" | "muted" | "default";
}

export function conversationChip(mode: ConversationMode, status: ConversationStatus): StatusChip {
  if (status === "closed") return { label: "Selesai", tone: "muted" };
  if (status === "escalated" && mode === "human") return { label: "Belum bisa dijawab", tone: "warning" };
  if (mode === "human") return { label: "Dibalas admin", tone: "default" };
  return { label: "Dijawab AI", tone: "success" };
}

export const AUTHOR_LABEL: Record<MessageAuthor, string> = {
  customer: "Pembeli",
  ai: "AI",
  human: "Admin",
  system: "Sistem",
};


/** An owner's manual reply (CHT-7): same length cap as an AI reply, and never internal-data words. */
export const OwnerReplyInput = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Balasan masih kosong.")
    .max(700, "Balasan maksimal 700 huruf.")
    .refine((t) => findForbiddenTerms(t).length === 0, "Balasan menyebut data internal (modal, margin, untung, saldo). Hapus dulu ya."),
});

/** Which inbox tab a conversation belongs to: "belum" = waiting for the owner. */
export function inboxTab(status: ConversationStatus): "belum" | "utama" {
  return status === "escalated" ? "belum" : "utama";
}

/**
 * CHT-7 "Jadikan FAQ": the buyer's question plus the reply that followed it (by AI or admin),
 * cut to what the FAQ form accepts. The owner reviews both before saving.
 */
export function faqDraftFrom(
  messages: readonly { id: string; author: MessageAuthor; content: string | null }[],
  messageId: string,
): { question: string; answer: string } | null {
  const i = messages.findIndex((m) => m.id === messageId);
  const asked = messages[i];
  if (!asked || asked.author !== "customer" || !asked.content?.trim()) return null;
  const reply = messages.slice(i + 1).find((m) => (m.author === "ai" || m.author === "human") && m.content);
  return { question: asked.content.trim().slice(0, 200), answer: (reply?.content ?? "").trim().slice(0, 700) };
}

export type InboxChannel = "widget" | "whatsapp" | "telegram" | "api";

export const CHANNEL_LABEL: Record<InboxChannel, string> = {
  widget: "Web",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  api: "Aplikasi",
};

/**
 * Who the inbox says is writing: the buyer's name from Telegram/WhatsApp when known, a WhatsApp
 * number as is, a web visitor as "Pengunjung AB12" (the session id is not a person).
 */
export function buyerLabel(c: { channel: string; external_user_id: string; display_name?: string | null }): string {
  if (c.display_name?.trim()) return c.display_name.trim();
  if (c.channel === "widget") return visitorLabel(c.external_user_id);
  if (c.channel === "whatsapp" && /^\d{8,15}$/.test(c.external_user_id)) return `+${c.external_user_id}`;
  return c.external_user_id;
}

