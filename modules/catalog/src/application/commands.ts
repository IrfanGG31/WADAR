import type {
  AddVariantBody,
  CreateProductBody,
  ImportProductsResult,
  SetChannelPriceBody,
  UpdateProductBody,
  UpdateVariantBody,
} from "@wadar/contracts";
import { outletBelongsToTenant } from "@wadar/identity";
import { emitEvent, insertAuditLog, withTenantContext, type Db, type Tx } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { planProductImport } from "../domain/product-import.js";
import {
  existingSkusAndBarcodes,
  findProduct,
  findVariant,
  insertProduct,
  insertVariants,
  updateProductRow,
  updateVariantRow,
  upsertCategory,
  upsertChannelPrice,
} from "../infra/catalog.repository.js";

export interface CommandContext {
  tenantId: string;
  actorUserId: string;
  correlationId: string;
}

export class CatalogError extends Error {
  constructor(
    readonly code: "PRODUCT_NOT_FOUND" | "VARIANT_NOT_FOUND" | "OUTLET_NOT_FOUND" | "DUPLICATE_SKU" | "DUPLICATE_BARCODE",
    message: string,
  ) {
    super(message);
  }
}

const UNIQUE_VIOLATION = "23505";

/** Postgres unique violations (possibly wrapped by Drizzle) → a friendly CatalogError. */
function translateUniqueViolation(error: unknown): never {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth++) {
    const pg = current as { code?: string; constraint?: string };
    if (pg.code === UNIQUE_VIOLATION) {
      if (pg.constraint?.includes("barcode")) throw new CatalogError("DUPLICATE_BARCODE", "Barcode ini sudah dipakai produk lain.");
      if (pg.constraint?.includes("sku")) throw new CatalogError("DUPLICATE_SKU", "SKU ini sudah dipakai produk lain.");
    }
    current = (current as { cause?: unknown }).cause;
  }
  throw error;
}

async function assertOutlet(tx: Tx, tenantId: string, outletId: string): Promise<void> {
  if (!(await outletBelongsToTenant(tx, tenantId, outletId))) {
    throw new CatalogError("OUTLET_NOT_FOUND", "Outlet tidak ditemukan.");
  }
}

interface NewVariantSpec {
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost?: number;
  initialStock?: number;
}

async function createProductInTx(
  tx: Tx,
  ctx: CommandContext,
  spec: { name: string; description?: string; category?: string; outletId: string; variants: NewVariantSpec[] },
): Promise<{ productId: string; variantIds: string[] }> {
  const productId = uuidv7();
  const categoryId = spec.category ? await upsertCategory(tx, ctx.tenantId, uuidv7(), spec.category) : null;
  await insertProduct(tx, {
    id: productId,
    tenantId: ctx.tenantId,
    name: spec.name,
    description: spec.description ?? null,
    categoryId,
    createdBy: ctx.actorUserId,
  });
  const variantRows = spec.variants.map((v) => ({
    id: uuidv7(),
    tenantId: ctx.tenantId,
    productId,
    name: v.name,
    sku: v.sku ?? null,
    barcode: v.barcode ?? null,
    price: v.price,
    cost: v.cost ?? null,
  }));
  await insertVariants(tx, variantRows);

  await emitEvent(tx, {
    type: "catalog.product.created",
    tenantId: ctx.tenantId,
    aggregateType: "product",
    aggregateId: productId,
    correlationId: ctx.correlationId,
    actor: { kind: "user", id: ctx.actorUserId },
    payload: {
      productId,
      name: spec.name,
      outletId: spec.outletId,
      variants: variantRows.map((row, i) => ({
        variantId: row.id,
        name: row.name,
        price: row.price,
        cost: row.cost,
        initialStock: spec.variants[i]!.initialStock ?? 0,
      })),
    },
  });
  return { productId, variantIds: variantRows.map((r) => r.id) };
}

export async function createProduct(db: Db, ctx: CommandContext, body: CreateProductBody) {
  try {
    return await withTenantContext(db, ctx.tenantId, async (tx) => {
      await assertOutlet(tx, ctx.tenantId, body.outletId);
      return createProductInTx(tx, ctx, {
        name: body.name,
        description: body.description,
        category: body.category,
        outletId: body.outletId,
        variants: body.variants.map((v) => ({ ...v, name: v.name ?? "" })),
      });
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    translateUniqueViolation(error);
  }
}

export async function updateProduct(db: Db, ctx: CommandContext, productId: string, body: UpdateProductBody): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    const product = await findProduct(tx, ctx.tenantId, productId);
    if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");

    let categoryId = product.categoryId;
    if (body.category !== undefined) {
      categoryId = body.category ? await upsertCategory(tx, ctx.tenantId, uuidv7(), body.category) : null;
    }
    await updateProductRow(tx, ctx.tenantId, productId, {
      name: body.name ?? product.name,
      description: body.description === undefined ? product.description : body.description,
      categoryId,
      archivedAt: body.archived === undefined ? product.archivedAt : body.archived ? new Date() : null,
    });
    await emitEvent(tx, {
      type: "catalog.product.updated",
      tenantId: ctx.tenantId,
      aggregateType: "product",
      aggregateId: productId,
      correlationId: ctx.correlationId,
      actor: { kind: "user", id: ctx.actorUserId },
      payload: { productId, name: body.name ?? product.name, archived: body.archived ?? product.archivedAt !== null },
    });
  });
}

export async function updateVariant(db: Db, ctx: CommandContext, variantId: string, body: UpdateVariantBody): Promise<void> {
  try {
    await withTenantContext(db, ctx.tenantId, async (tx) => {
      const variant = await findVariant(tx, ctx.tenantId, variantId);
      if (!variant) throw new CatalogError("VARIANT_NOT_FOUND", "Varian tidak ditemukan.");

      await updateVariantRow(tx, ctx.tenantId, variantId, {
        name: body.name ?? variant.name,
        sku: body.sku === undefined ? variant.sku : body.sku || null,
        barcode: body.barcode === undefined ? variant.barcode : body.barcode || null,
        price: body.price ?? variant.price,
        cost: body.cost === undefined ? variant.cost : body.cost,
        archivedAt: body.archived === undefined ? variant.archivedAt : body.archived ? new Date() : null,
      });

      const priceChanged = body.price !== undefined && body.price !== variant.price;
      const costChanged = body.cost !== undefined && body.cost !== variant.cost;
      if (priceChanged || costChanged) {
        // ARCHITECTURE §9: "ubah harga" is an audited action.
        await insertAuditLog(tx, {
          id: uuidv7(),
          tenantId: ctx.tenantId,
          actor: ctx.actorUserId,
          action: "variant.price_changed",
          entity: `variant:${variantId}`,
          before: { price: variant.price, cost: variant.cost },
          after: { price: body.price ?? variant.price, cost: body.cost === undefined ? variant.cost : body.cost },
        });
        await emitEvent(tx, {
          type: "catalog.price.changed",
          tenantId: ctx.tenantId,
          aggregateType: "variant",
          aggregateId: variantId,
          correlationId: ctx.correlationId,
          actor: { kind: "user", id: ctx.actorUserId },
          payload: {
            variantId,
            productId: variant.productId,
            oldPrice: variant.price,
            newPrice: body.price ?? variant.price,
            oldCost: variant.cost,
            newCost: body.cost === undefined ? variant.cost : body.cost,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    translateUniqueViolation(error);
  }
}

export async function addVariant(db: Db, ctx: CommandContext, productId: string, body: AddVariantBody) {
  try {
    return await withTenantContext(db, ctx.tenantId, async (tx) => {
      const product = await findProduct(tx, ctx.tenantId, productId);
      if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
      await assertOutlet(tx, ctx.tenantId, body.outletId);
      const variantId = uuidv7();
      await insertVariants(tx, [
        {
          id: variantId,
          tenantId: ctx.tenantId,
          productId,
          name: body.name,
          sku: body.sku ?? null,
          barcode: body.barcode ?? null,
          price: body.price,
          cost: body.cost ?? null,
        },
      ]);
      await emitEvent(tx, {
        type: "catalog.variant.created",
        tenantId: ctx.tenantId,
        aggregateType: "product",
        aggregateId: productId,
        correlationId: ctx.correlationId,
        actor: { kind: "user", id: ctx.actorUserId },
        payload: {
          productId,
          outletId: body.outletId,
          variants: [{ variantId, name: body.name, price: body.price, cost: body.cost ?? null, initialStock: body.initialStock ?? 0 }],
        },
      });
      return { variantId };
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    translateUniqueViolation(error);
  }
}

export async function setChannelPrice(db: Db, ctx: CommandContext, variantId: string, body: SetChannelPriceBody): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    const variant = await findVariant(tx, ctx.tenantId, variantId);
    if (!variant) throw new CatalogError("VARIANT_NOT_FOUND", "Varian tidak ditemukan.");
    await upsertChannelPrice(tx, ctx.tenantId, variantId, body.channel, body.price);
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: "variant.channel_price_changed",
      entity: `variant:${variantId}`,
      after: { channel: body.channel, price: body.price },
    });
  });
}

export async function setProductPhoto(db: Db, ctx: CommandContext, productId: string, photoPath: string): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    const product = await findProduct(tx, ctx.tenantId, productId);
    if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    await updateProductRow(tx, ctx.tenantId, productId, { photoPath });
  });
}

/**
 * Validates every row and, unless `dryRun`, creates all valid products in
 * ONE transaction (docs/BUILD-PLAN.md M2 DoD: 500 products < 30 s).
 */
export async function importProducts(
  db: Db,
  ctx: CommandContext,
  input: { outletId: string; dryRun: boolean; rows: Array<Record<string, unknown>> },
): Promise<ImportProductsResult> {
  return withTenantContext(db, ctx.tenantId, async (tx) => {
    await assertOutlet(tx, ctx.tenantId, input.outletId);
    const plan = planProductImport(input.rows, await existingSkusAndBarcodes(tx, ctx.tenantId));
    const result: ImportProductsResult = {
      dryRun: input.dryRun,
      totalRows: input.rows.length,
      validRows: plan.validRows,
      productsCreated: 0,
      variantsCreated: 0,
      errors: plan.errors,
    };
    if (input.dryRun) return result;

    for (const product of plan.products) {
      const created = await createProductInTx(tx, ctx, {
        name: product.name,
        category: product.category,
        outletId: input.outletId,
        variants: product.variants.map((v) => ({
          name: v.name,
          sku: v.sku,
          barcode: v.barcode,
          price: v.price,
          cost: v.cost,
          initialStock: v.stock,
        })),
      });
      result.productsCreated += 1;
      result.variantsCreated += created.variantIds.length;
    }
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: "catalog.imported",
      entity: `tenant:${ctx.tenantId}`,
      after: { products: result.productsCreated, variants: result.variantsCreated, errors: plan.errors.length },
    });
    return result;
  });
}
