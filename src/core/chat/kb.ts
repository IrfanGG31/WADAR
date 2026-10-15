import { z } from "zod";
import { findForbiddenTerms } from "./text";

/**
 * Knowledge-base chunks (TECH-SPEC §7.5): one FAQ pair = one chunk
 * (`metadata.kind = 'faq'`); one product = one chunk of the `catalog`
 * document — name, category, variants, description, and deliberately **no
 * price and no stock** (those are always read live from `chat_product_cards`).
 */
export const FaqInput = z.object({
  question: z.string().trim().min(5, "Pertanyaan minimal 5 huruf.").max(200),
  answer: z
    .string()
    .trim()
    .min(2, "Jawaban wajib diisi.")
    .max(700)
    .refine((a) => findForbiddenTerms(a).length === 0, {
      message: "Jawaban dibaca pembeli: jangan tulis HPP, modal, margin, untung, saldo, atau laba.",
    }),
});

export type FaqInput = z.infer<typeof FaqInput>;

export interface KbChunkDraft {
  content: string;
  metadata: Record<string, string>;
}

export function faqChunk(faq: FaqInput): KbChunkDraft {
  return {
    content: `Tanya: ${faq.question}\nJawab: ${faq.answer}`,
    metadata: { kind: "faq", question: faq.question, answer: faq.answer },
  };
}

/** Catalog input: the type itself has no price or cost fields, so they cannot leak into an embedding. */
export interface CatalogProduct {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  options: readonly (string | null)[];
}

export function catalogChunk(product: CatalogProduct): KbChunkDraft {
  const options = product.options.filter((o): o is string => Boolean(o && o.trim()));
  const lines = [
    `Produk: ${product.name}`,
    product.category ? `Kategori: ${product.category}` : "",
    options.length ? `Pilihan: ${options.join(", ")}` : "",
    product.description ? `Deskripsi: ${product.description}` : "",
  ].filter(Boolean);
  return { content: lines.join("\n"), metadata: { kind: "catalog", product_id: product.id, name: product.name } };
}

export type KbStatus = "processing" | "ready" | "failed";

export const KB_STATUS_LABEL: Record<KbStatus, string> = {
  processing: "Sedang diproses",
  ready: "Siap",
  failed: "Gagal",
};
