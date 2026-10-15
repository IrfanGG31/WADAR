import { z } from "zod";

/**
 * Customer Chat reply contract (TECH-SPEC §7.3 step 4). The model fills this
 * object; guardrails (./guardrails.ts) decide whether it may be sent.
 */
export const CHAT_INTENTS = [
  "produk",
  "harga",
  "stok",
  "cara_pesan",
  "ongkir_kirim",
  "pembayaran",
  "jam_lokasi",
  "retur_garansi",
  "status_pesanan",
  "sapaan",
  "di_luar_cakupan",
] as const;

export const ESCALATE_REASONS = ["not_in_store_data", "negotiation", "policy_exception", "other"] as const;

export const ChatReply = z.object({
  intent: z.enum(CHAT_INTENTS),
  reply: z.string().max(700),
  sources: z.array(z.object({ type: z.enum(["product", "policy", "kb"]), id: z.string() })),
  confidence: z.number().min(0).max(1),
  escalate: z.boolean(),
  escalate_reason: z.enum(ESCALATE_REASONS).optional(),
});

export type ChatReply = z.infer<typeof ChatReply>;
export type ChatIntent = (typeof CHAT_INTENTS)[number];
export type EscalateReason = (typeof ESCALATE_REASONS)[number];
export type ChatSource = ChatReply["sources"][number];

/**
 * Why a conversation went to the owner. Stored in `conversations.escalation_reason`
 * and shown in the inbox. A superset of `EscalateReason`: the pre-router and the
 * guardrails add their own causes.
 */
export const ESCALATION_CAUSES = [
  "media_received",
  "human_requested",
  "complaint",
  "negotiation",
  "not_in_store_data",
  "policy_exception",
  "low_confidence",
  "out_of_scope",
  "price_mismatch",
  "stock_mismatch",
  "unsafe",
  "other",
] as const;

export type EscalationCause = (typeof ESCALATION_CAUSES)[number];

/** One row of the `chat_product_cards` view (TECH-SPEC §4.4) — by construction no cost, margin or real stock. */
export interface ProductCard {
  variant_id: string;
  name: string;
  option_label: string | null;
  category: string | null;
  description: string | null;
  price: number;
  availability: "habis" | "sisa_sedikit" | "tersedia";
  qty_hint: number;
}

/** A knowledge-base chunk handed to the model (FAQ pair or document excerpt). */
export interface KbSnippet {
  id: string;
  kind: "faq" | "doc";
  content: string;
  /** FAQ only: the question and answer, kept apart for the offline responder. */
  question?: string;
  answer?: string;
}

export interface HistoryTurn {
  author: "customer" | "ai" | "human" | "system";
  content: string;
}
