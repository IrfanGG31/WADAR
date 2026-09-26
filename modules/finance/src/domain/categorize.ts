import type { CategorySuggestion, ExpenseCategory } from "@wadar/contracts";

/** Built-in Indonesian keyword dictionary (PRD F2.3 "aturan"). First match wins. */
const KEYWORDS: Array<[ExpenseCategory, string[]]> = [
  ["exp_utilities", ["listrik", "pln", "token", "air", "pdam", "internet", "wifi", "indihome", "pulsa", "kuota"]],
  ["exp_salary", ["gaji", "upah", "bonus", "thr", "karyawan", "honor"]],
  ["exp_rent", ["sewa", "kontrak", "kontrakan", "kios", "lapak"]],
  ["exp_ads", ["iklan", "ads", "promosi", "promo", "endorse", "boost", "facebook", "instagram", "tiktok ads", "meta"]],
  ["exp_shipping", ["ongkir", "kirim", "ekspedisi", "jne", "jnt", "j&t", "sicepat", "gosend", "grab express", "kurir", "paket"]],
  ["exp_supplies", ["bahan", "belanja", "kulakan", "plastik", "kemasan", "packaging", "kardus", "stok", "kopi", "susu", "gula", "tepung", "minyak"]],
  ["exp_operational", ["bensin", "parkir", "transport", "ojek", "atk", "fotokopi", "servis", "perbaikan", "kebersihan", "sabun", "galon"]],
];

export function normalizeKeyword(note: string): string | undefined {
  const word = note
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, " ")
    .split(/\s+/)
    .find((w) => w.length >= 3 && !/^\d+$/.test(w));
  return word;
}

/**
 * Suggests a category from the note: this store's learned rules first
 * ("confirm once, the system learns" — PRD F2.3), then the dictionary.
 */
export function suggestCategory(note: string, learned: ReadonlyMap<string, ExpenseCategory>): CategorySuggestion {
  const text = ` ${note.toLowerCase()} `;
  for (const [keyword, category] of learned) {
    if (text.includes(` ${keyword} `) || text.includes(` ${keyword}`)) return { category, source: "rule" };
  }
  for (const [category, words] of KEYWORDS) {
    if (words.some((w) => text.includes(w))) return { category, source: "keyword" };
  }
  return { category: "exp_other", source: "default" };
}
