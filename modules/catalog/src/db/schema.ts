import { tenantRlsPolicy } from "@wadar/platform";
import { sql } from "drizzle-orm";
import { bigint, index, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const catalogSchema = pgSchema("catalog");

/** Rupiah column: BIGINT in Postgres (CLAUDE.md aturan #3), JS safe integer in app code. */
const rupiah = (name: string) => bigint(name, { mode: "number" });

export const categories = catalogSchema.table(
  "categories",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_tenant_id_name_idx").on(table.tenantId, sql`lower(${table.name})`),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/** Master data (not a transaction): editable, soft-archived via `archived_at` (ARCHITECTURE §5.1). */
export const products = catalogSchema.table(
  "products",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id),
    /** Supabase Storage object path (`<tenantId>/products/<productId>/...`), never a public URL. */
    photoPath: text("photo_path"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("products_tenant_id_name_idx").on(table.tenantId, table.name),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/**
 * The sellable unit. A product with no real options still has exactly one
 * variant (name ""), so sales/inventory always reference variants.
 */
export const variants = catalogSchema.table(
  "variants",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull().default(""),
    sku: text("sku"),
    barcode: text("barcode"),
    price: rupiah("price").notNull(),
    /** HPP awal / manual cost. Inventory's moving average takes over once stock moves with a cost. */
    cost: rupiah("cost"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("variants_tenant_id_product_id_idx").on(table.tenantId, table.productId),
    uniqueIndex("variants_tenant_id_sku_idx").on(table.tenantId, sql`lower(${table.sku})`).where(sql`${table.sku} is not null`),
    uniqueIndex("variants_tenant_id_barcode_idx")
      .on(table.tenantId, table.barcode)
      .where(sql`${table.barcode} is not null`),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/** Per-channel price override (PRD O1.1: "harga jual per kanal"). Absent row = base variant price. */
export const channelPrices = catalogSchema.table(
  "channel_prices",
  {
    tenantId: uuid("tenant_id").notNull(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id),
    channel: text("channel").notNull(),
    price: rupiah("price").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.variantId, table.channel] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();
