import type { MemoryItem } from "@/core/consult/tools";

/**
 * Konsultasi prompts (TECH-SPEC §7.4). The model never calculates: every
 * number it may quote comes from the snapshot below or from a tool result,
 * and the answer is checked against both (src/core/consult/grounding.ts).
 */
export const CONSULT_PROMPT_VERSION = "consult.v1";

const RULES = [
  "Kamu konsultan bisnis untuk pemilik toko kecil. Jawab dalam Bahasa Indonesia sehari-hari, singkat (maks 6 kalimat), konkret.",
  "Semua angka (rupiah, persen, jumlah) HARUS persis berasal dari SNAPSHOT atau hasil tool. Jangan menghitung, menjumlah, atau membulatkan sendiri.",
  "Selisih dan persen sudah dihitung di hasil tool (kolom *_delta, *_pct): kutip apa adanya.",
  "Butuh angka yang tidak ada? Panggil tool yang sesuai. Tidak ada datanya? Katakan terus terang, jangan menebak.",
  "Beri saran yang bisa dikerjakan hari ini. Jangan membahas hal di luar data toko ini.",
];

export function consultSystem(snapshot: unknown, preferences: readonly MemoryItem[]): string {
  const prefs = preferences.filter((p) => p.pinned).map((p) => `- ${p.content}`);
  return [
    ...RULES,
    prefs.length ? `PREFERENSI PEMILIK (patuhi):\n${prefs.join("\n")}` : "",
    `SNAPSHOT:\n${JSON.stringify(snapshot)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function narrateSystem(): string {
  return [
    "Kamu merangkum insight mingguan untuk pemilik toko. Bahasa Indonesia sehari-hari.",
    "Tulis tepat 3 poin bernomor (satu per insight, satu kalimat) lalu 1 kalimat ringkasan.",
    "Pakai angka persis seperti di EVIDENCE; jangan menghitung atau menambah angka baru.",
  ].join("\n");
}
