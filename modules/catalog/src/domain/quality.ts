export type MissingField = "cost" | "photo" | "price";

export interface QualityInput {
  photoPath: string | null;
  variants: Array<{ price: number; cost: number | null; archived: boolean }>;
}

/**
 * PRD F3.9 / R4 — what's missing for accurate "untung per produk".
 * Only active variants count; an archived variant's gaps don't matter.
 */
export function missingFields(product: QualityInput): MissingField[] {
  const active = product.variants.filter((v) => !v.archived);
  const missing: MissingField[] = [];
  if (active.some((v) => v.cost === null)) missing.push("cost");
  if (!product.photoPath) missing.push("photo");
  if (active.some((v) => v.price <= 0)) missing.push("price");
  return missing;
}
