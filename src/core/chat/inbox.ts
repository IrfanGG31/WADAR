import type { EscalationCause } from "./schema";

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
