import { z } from "zod";

/** FIN-1 default categories (PRD §7.3 H). The owner may type another one. */
export const EXPENSE_CATEGORIES = [
  "Bahan/Stok non-katalog",
  "Gaji",
  "Sewa",
  "Listrik & Air",
  "Internet",
  "Iklan",
  "Ongkir",
  "Lain-lain",
] as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Three required fields (nominal, kategori, tanggal) + optional note — PRD FIN-1 "≤ 3 kolom wajib". */
export const ExpenseInput = z.object({
  amount: z
    .number({ error: "Isi nominalnya." })
    .int("Nominal harus rupiah utuh.")
    .positive("Nominal harus lebih dari 0.")
    .max(1_000_000_000_000, "Nominal terlalu besar."),
  category: z
    .string({ error: "Pilih kategori." })
    .trim()
    .min(2, "Pilih kategori.")
    .max(40, "Nama kategori maksimal 40 huruf."),
  occurred_on: z.string().regex(ISO_DAY, "Tanggal belum benar."),
  note: z.string().trim().max(200, "Catatan maksimal 200 huruf.").optional().default(""),
  idempotency_key: z.string().min(8).max(80),
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;

/** An expense dated after the shop's today is almost always a typo. */
export function expenseDateProblem(day: string, today: string): string | null {
  if (!ISO_DAY.test(day)) return "Tanggal belum benar.";
  if (day > today) return "Tanggal pengeluaran tidak boleh setelah hari ini.";
  return null;
}

export interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  occurred_at: string;
  note: string | null;
  voided_at: string | null;
}

export interface CategoryTotal {
  category: string;
  amount: number;
  count: number;
  share_pct: number;
}

/** Totals per category (voided rows left out), largest first; shares sum to 100 (largest remainder). */
export function expensesByCategory(rows: readonly ExpenseRow[]): { total: number; categories: CategoryTotal[] } {
  const map = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const r of rows) {
    if (r.voided_at) continue;
    const cur = map.get(r.category) ?? { amount: 0, count: 0 };
    cur.amount += r.amount;
    cur.count += 1;
    map.set(r.category, cur);
    total += r.amount;
  }
  const entries = [...map.entries()].sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0], "id"));
  const shares = largestRemainderPct(entries.map(([, v]) => v.amount), total);
  return {
    total,
    categories: entries.map(([category, v], i) => ({ category, amount: v.amount, count: v.count, share_pct: shares[i] })),
  };
}

function largestRemainderPct(values: number[], total: number): number[] {
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v * 100) / total);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}
