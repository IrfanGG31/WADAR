import { z } from "zod";
import type { KbChunkDraft } from "./kb";

/**
 * KB-2: the owner's own documents (price list, size guide, care instructions, SOP) as knowledge for
 * the chat assistant. Plain text only — the text is split into paragraph-sized chunks that the
 * retrieval step ranks like FAQs. What is uploaded can be quoted to buyers, so it must not hold
 * internal numbers (modal/HPP): the page says so, and the grounding guardrails still apply.
 */
export const MAX_DOC_CHARS = 60_000;
export const MAX_DOC_BYTES = 200_000;
export const CHUNK_CHARS = 900;

export const DocInput = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 huruf.").max(120, "Judul maksimal 120 huruf."),
  text: z
    .string()
    .transform((t) => normalizeDocText(t))
    .pipe(
      z
        .string()
        .min(20, "Isi dokumen terlalu pendek.")
        .max(MAX_DOC_CHARS, `Isi dokumen maksimal ${MAX_DOC_CHARS.toLocaleString("id-ID")} huruf. Pecah jadi beberapa dokumen.`),
    ),
});
export type DocInput = z.infer<typeof DocInput>;

/** CRLF → LF, trailing spaces and runs of blank lines collapsed, control characters dropped. */
export function normalizeDocText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Paragraph-first chunking: paragraphs are packed up to `max` characters; a paragraph longer than
 * that is cut at sentence ends, then at spaces. Each chunk starts with the document title so a
 * retrieved piece still says what it is about.
 */
export function chunkDocument(title: string, text: string, max = CHUNK_CHARS): KbChunkDraft[] {
  const pieces: string[] = [];
  for (const para of normalizeDocText(text).split(/\n{2,}/)) {
    if (para.length <= max) {
      pieces.push(para);
      continue;
    }
    let rest = para;
    while (rest.length > max) {
      const window = rest.slice(0, max);
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("! "), window.lastIndexOf("? "));
      const space = window.lastIndexOf(" ");
      const cut = sentence > max / 2 ? sentence + 1 : space > max / 2 ? space : max;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }
  const chunks: string[] = [];
  let current = "";
  for (const p of pieces) {
    if (current && current.length + 2 + p.length > max) {
      chunks.push(current);
      current = p;
    } else current = current ? `${current}\n\n${p}` : p;
  }
  if (current) chunks.push(current);
  return chunks.map((content, i) => ({
    content: `${title}\n${content}`,
    metadata: { kind: "doc", title, part: String(i + 1) },
  }));
}

/** Which uploads are read as text; PDF/Word need converting first (Simpan sebagai .txt). */
export function docFileProblem(name: string, size: number): string | null {
  if (!/\.(txt|md|csv)$/i.test(name)) return "Untuk sekarang yang bisa dibaca file teks (.txt). Dari PDF/Word: salin isinya lalu tempel di kolom isi, atau simpan sebagai .txt.";
  if (size > MAX_DOC_BYTES) return "File terlalu besar (maksimal 200 KB). Pecah jadi beberapa dokumen.";
  return null;
}
