import { z } from "zod";

/**
 * Rupiah amount on the wire: a whole-rupiah integer (CLAUDE.md aturan #3).
 * Stored as BIGINT in Postgres; carried as a JS safe integer in JSON
 * (exact up to ~9 quadrillion rupiah), never a float.
 */
export const Rupiah = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export type Rupiah = z.infer<typeof Rupiah>;

/** Signed rupiah (deltas, profit that can go negative). */
export const SignedRupiah = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

/** Sales channels (PRD O3.1, ARCHITECTURE §3 sales). */
export const SalesChannel = z.enum(["pos", "whatsapp", "shopee", "tiktok", "tokopedia", "other"]);
export type SalesChannel = z.infer<typeof SalesChannel>;

export const SALES_CHANNEL_LABEL: Record<SalesChannel, string> = {
  pos: "Kasir",
  whatsapp: "WhatsApp",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  tokopedia: "Tokopedia",
  other: "Lainnya",
};

/** YYYY-MM-DD in the tenant's timezone. */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type LocalDate = z.infer<typeof LocalDate>;
