import { z } from "zod";

/** CRM-2: what the shop writes about a buyer — name, short tags ("reseller", "langganan"), free notes. */
export const MAX_TAGS = 10;

/** "Reseller, langganan,  reseller" → ["reseller", "langganan"]: trimmed, lowercase, unique, max 24 chars each. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[,\n#]/)) {
    const tag = raw.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 24);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export const CustomerProfileInput = z.object({
  name: z
    .string()
    .trim()
    .max(80, "Nama maksimal 80 huruf.")
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .max(500, "Catatan maksimal 500 huruf.")
    .transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(24)).max(MAX_TAGS, `Maksimal ${MAX_TAGS} label.`),
});
export type CustomerProfileInput = z.infer<typeof CustomerProfileInput>;

export interface FavoriteProduct {
  name: string;
  qty: number;
  times: number;
}

/** Most-bought products of one buyer from their sales (voided/canceled ones ignored), by qty then frequency. */
export function favoriteProducts(
  sales: readonly { status: string; items: readonly { name_snapshot: string; qty: number }[] }[],
  limit = 3,
): FavoriteProduct[] {
  const byName = new Map<string, FavoriteProduct>();
  for (const sale of sales) {
    if (sale.status !== "completed") continue;
    for (const item of sale.items) {
      const f = byName.get(item.name_snapshot) ?? { name: item.name_snapshot, qty: 0, times: 0 };
      f.qty += Number(item.qty);
      f.times += 1;
      byName.set(item.name_snapshot, f);
    }
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty || b.times - a.times || a.name.localeCompare(b.name)).slice(0, limit);
}
