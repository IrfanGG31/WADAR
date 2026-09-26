import type { ProductView, SalesChannel, VariantView } from "@wadar/contracts";
import { withTenantContext, type Db, type Tx } from "@wadar/platform";
import { missingFields, type MissingField } from "../domain/quality.js";
import { loadCatalog, loadChannelPrices, loadVariantsWithProducts, type CatalogSnapshot } from "../infra/catalog.repository.js";

export interface CatalogProduct extends Omit<ProductView, "photoUrl"> {
  photoPath: string | null;
}

function assemble(snapshot: CatalogSnapshot, includeCost: boolean): CatalogProduct[] {
  const pricesByVariant = new Map<string, Partial<Record<SalesChannel, number>>>();
  for (const row of snapshot.channelPrices) {
    const entry = pricesByVariant.get(row.variantId) ?? {};
    entry[row.channel as SalesChannel] = row.price;
    pricesByVariant.set(row.variantId, entry);
  }
  const variantsByProduct = new Map<string, VariantView[]>();
  const rawByProduct = new Map<string, Array<{ price: number; cost: number | null; archived: boolean }>>();
  for (const v of snapshot.variants) {
    const view: VariantView = {
      id: v.id,
      productId: v.productId,
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      channelPrices: pricesByVariant.get(v.id) ?? {},
      archived: v.archivedAt !== null,
    };
    if (includeCost) view.cost = v.cost;
    variantsByProduct.set(v.productId, [...(variantsByProduct.get(v.productId) ?? []), view]);
    rawByProduct.set(v.productId, [
      ...(rawByProduct.get(v.productId) ?? []),
      { price: v.price, cost: v.cost, archived: v.archivedAt !== null },
    ]);
  }
  return snapshot.products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.categoryName,
    photoPath: p.photoPath,
    archived: p.archivedAt !== null,
    createdAt: p.createdAt.toISOString(),
    variants: variantsByProduct.get(p.id) ?? [],
    missing: missingFields({ photoPath: p.photoPath, variants: rawByProduct.get(p.id) ?? [] }),
  }));
}

export async function listProducts(
  db: Db,
  tenantId: string,
  options: { search?: string; includeArchived?: boolean; includeCost: boolean },
): Promise<CatalogProduct[]> {
  return withTenantContext(db, tenantId, (tx) => loadCatalogProducts(tx, tenantId, options));
}

/** Port: the catalog as plain data, inside the caller's transaction (used by inventory's stock overview). */
export async function loadCatalogProducts(
  tx: Tx,
  tenantId: string,
  options: { search?: string; includeArchived?: boolean; includeCost: boolean; productIds?: string[] },
): Promise<CatalogProduct[]> {
  return assemble(await loadCatalog(tx, tenantId, options), options.includeCost);
}

export async function getProduct(db: Db, tenantId: string, productId: string, includeCost: boolean) {
  const [product] = await withTenantContext(db, tenantId, (tx) =>
    loadCatalogProducts(tx, tenantId, { includeArchived: true, includeCost, productIds: [productId] }),
  );
  return product;
}

export interface VariantForSale {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number | null;
  channelPrices: Partial<Record<SalesChannel, number>>;
  archived: boolean;
}

/** Port for sales: authoritative price/cost for the variants in a cart. */
export async function getVariantsForSale(tx: Tx, tenantId: string, variantIds: string[]): Promise<VariantForSale[]> {
  const unique = [...new Set(variantIds)];
  const [rows, prices] = await Promise.all([
    loadVariantsWithProducts(tx, tenantId, unique),
    loadChannelPrices(tx, tenantId, unique),
  ]);
  const pricesByVariant = new Map<string, Partial<Record<SalesChannel, number>>>();
  for (const row of prices) {
    const entry = pricesByVariant.get(row.variantId) ?? {};
    entry[row.channel as SalesChannel] = row.price;
    pricesByVariant.set(row.variantId, entry);
  }
  return rows.map(({ variant, productName, productArchivedAt }) => ({
    variantId: variant.id,
    productId: variant.productId,
    productName,
    variantName: variant.name,
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.price,
    cost: variant.cost,
    channelPrices: pricesByVariant.get(variant.id) ?? {},
    archived: variant.archivedAt !== null || productArchivedAt !== null,
  }));
}

export interface CatalogQualitySummary {
  activeProducts: number;
  missing: Record<MissingField, number>;
  examples: Array<{ productId: string; name: string; missing: MissingField[] }>;
}

/** Port for insights' Beranda feed (PRD F3.9 / R4). */
export async function getCatalogQualitySummary(tx: Tx, tenantId: string): Promise<CatalogQualitySummary> {
  const products = await loadCatalogProducts(tx, tenantId, { includeCost: true });
  const missing: Record<MissingField, number> = { cost: 0, photo: 0, price: 0 };
  const examples: CatalogQualitySummary["examples"] = [];
  for (const product of products) {
    for (const field of product.missing) missing[field] += 1;
    if (product.missing.length > 0 && examples.length < 5) {
      examples.push({ productId: product.id, name: product.name, missing: product.missing });
    }
  }
  return { activeProducts: products.length, missing, examples };
}
