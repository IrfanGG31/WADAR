import type { Tx } from "@wadar/platform";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { categories, channelPrices, products, variants } from "../db/schema.js";

export type ProductRow = typeof products.$inferSelect;
export type VariantRow = typeof variants.$inferSelect;

export async function upsertCategory(tx: Tx, tenantId: string, id: string, name: string): Promise<string> {
  // Insert first: with select-then-insert, two products saved at the same
  // moment with the same NEW category both miss the select and the second
  // insert hits the (tenant_id, lower(name)) unique index → 500. ON CONFLICT
  // makes the loser wait for the winner's commit and then reuse its row.
  const [inserted] = await tx
    .insert(categories)
    .values({ id, tenantId, name })
    .onConflictDoNothing()
    .returning({ id: categories.id });
  if (inserted) return inserted.id;
  const [existing] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), sql`lower(${categories.name}) = lower(${name})`));
  return existing!.id;
}

export async function insertProduct(tx: Tx, row: typeof products.$inferInsert): Promise<void> {
  await tx.insert(products).values(row);
}

export async function insertVariants(tx: Tx, rows: Array<typeof variants.$inferInsert>): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(variants).values(rows);
}

export async function findProduct(tx: Tx, tenantId: string, productId: string): Promise<ProductRow | undefined> {
  const [row] = await tx
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.id, productId)));
  return row;
}

export async function findVariant(tx: Tx, tenantId: string, variantId: string): Promise<VariantRow | undefined> {
  const [row] = await tx
    .select()
    .from(variants)
    .where(and(eq(variants.tenantId, tenantId), eq(variants.id, variantId)));
  return row;
}

export async function updateProductRow(
  tx: Tx,
  tenantId: string,
  productId: string,
  patch: Partial<Pick<ProductRow, "name" | "description" | "categoryId" | "photoPath" | "archivedAt">>,
): Promise<void> {
  await tx
    .update(products)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(products.tenantId, tenantId), eq(products.id, productId)));
}

export async function updateVariantRow(
  tx: Tx,
  tenantId: string,
  variantId: string,
  patch: Partial<Pick<VariantRow, "name" | "sku" | "barcode" | "price" | "cost" | "archivedAt">>,
): Promise<void> {
  await tx
    .update(variants)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(variants.tenantId, tenantId), eq(variants.id, variantId)));
}

export async function upsertChannelPrice(
  tx: Tx,
  tenantId: string,
  variantId: string,
  channel: string,
  price: number | null,
): Promise<void> {
  if (price === null) {
    await tx
      .delete(channelPrices)
      .where(and(eq(channelPrices.tenantId, tenantId), eq(channelPrices.variantId, variantId), eq(channelPrices.channel, channel)));
    return;
  }
  await tx
    .insert(channelPrices)
    .values({ tenantId, variantId, channel, price })
    .onConflictDoUpdate({
      target: [channelPrices.variantId, channelPrices.channel],
      set: { price, updatedAt: new Date() },
    });
}

export interface CatalogSnapshot {
  products: Array<ProductRow & { categoryName: string | null }>;
  variants: VariantRow[];
  channelPrices: Array<typeof channelPrices.$inferSelect>;
}

/** Whole catalog (optionally filtered) in 3 queries — tenants have hundreds to low thousands of SKUs. */
export async function loadCatalog(
  tx: Tx,
  tenantId: string,
  options: { search?: string; includeArchived?: boolean; productIds?: string[] } = {},
): Promise<CatalogSnapshot> {
  const conditions = [eq(products.tenantId, tenantId)];
  if (!options.includeArchived) conditions.push(isNull(products.archivedAt));
  if (options.productIds) {
    if (options.productIds.length === 0) return { products: [], variants: [], channelPrices: [] };
    conditions.push(inArray(products.id, options.productIds));
  }
  if (options.search) {
    const pattern = `%${options.search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const matchingVariantProducts = tx
      .select({ productId: variants.productId })
      .from(variants)
      .where(
        and(
          eq(variants.tenantId, tenantId),
          or(ilike(variants.sku, pattern), eq(variants.barcode, options.search), ilike(variants.name, pattern)),
        ),
      );
    conditions.push(or(ilike(products.name, pattern), inArray(products.id, matchingVariantProducts))!);
  }

  const productRows = await tx
    .select({ product: products, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conditions))
    .orderBy(asc(products.name));
  const ids = productRows.map((row) => row.product.id);
  if (ids.length === 0) return { products: [], variants: [], channelPrices: [] };

  const variantRows = await tx
    .select()
    .from(variants)
    .where(and(eq(variants.tenantId, tenantId), inArray(variants.productId, ids)))
    .orderBy(asc(variants.createdAt));
  const variantIds = variantRows.map((v) => v.id);
  const priceRows =
    variantIds.length === 0
      ? []
      : await tx
          .select()
          .from(channelPrices)
          .where(and(eq(channelPrices.tenantId, tenantId), inArray(channelPrices.variantId, variantIds)));

  return {
    products: productRows.map((row) => ({ ...row.product, categoryName: row.categoryName })),
    variants: variantRows,
    channelPrices: priceRows,
  };
}

export async function loadVariantsWithProducts(tx: Tx, tenantId: string, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return tx
    .select({ variant: variants, productName: products.name, productArchivedAt: products.archivedAt })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.tenantId, tenantId), inArray(variants.id, variantIds)));
}

export async function loadChannelPrices(tx: Tx, tenantId: string, variantIds: string[]) {
  if (variantIds.length === 0) return [];
  return tx
    .select()
    .from(channelPrices)
    .where(and(eq(channelPrices.tenantId, tenantId), inArray(channelPrices.variantId, variantIds)));
}

export async function existingSkusAndBarcodes(tx: Tx, tenantId: string): Promise<{ skus: Set<string>; barcodes: Set<string> }> {
  const rows = await tx
    .select({ sku: variants.sku, barcode: variants.barcode })
    .from(variants)
    .where(eq(variants.tenantId, tenantId));
  const skus = new Set<string>();
  const barcodes = new Set<string>();
  for (const row of rows) {
    if (row.sku) skus.add(row.sku.toLowerCase());
    if (row.barcode) barcodes.add(row.barcode);
  }
  return { skus, barcodes };
}
