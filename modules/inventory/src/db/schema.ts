import { tenantRlsPolicy } from "@wadar/platform";
import { bigint, index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const inventorySchema = pgSchema("inventory");

export const stockMovementReason = inventorySchema.enum("stock_movement_reason", [
  "opening",
  "sale",
  "void",
  "adjustment",
  "purchase",
  "return",
  "transfer_in",
  "transfer_out",
]);

const rupiah = (name: string) => bigint(name, { mode: "number" });

/**
 * Source of truth for stock (ARCHITECTURE §5.3) — append-only, never
 * updated or deleted (CLAUDE.md aturan #4). `balance_after`/`avg_cost_after`
 * snapshot the projection right after this movement for audit/debugging.
 */
export const stockMovements = inventorySchema.table(
  "stock_movements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    delta: integer("delta").notNull(),
    reason: stockMovementReason("reason").notNull(),
    unitCost: rupiah("unit_cost"),
    balanceAfter: integer("balance_after").notNull(),
    avgCostAfter: rupiah("avg_cost_after"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_tenant_variant_idx").on(table.tenantId, table.variantId, table.createdAt),
    index("stock_movements_tenant_outlet_created_idx").on(table.tenantId, table.outletId, table.createdAt),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/** Projection of stock_movements, updated in the SAME transaction as each movement. */
export const stockLevels = inventorySchema.table(
  "stock_levels",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    avgCost: rupiah("avg_cost"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_levels_tenant_outlet_variant_idx").on(table.tenantId, table.outletId, table.variantId),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/** Stock-out prediction (PRD O4.2, ARCHITECTURE §5.3) — recomputed nightly and on significant stock changes. */
export const forecasts = inventorySchema.table(
  "forecasts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    /** Units/day × 1000 (integer; no floats in storage). */
    dailyRateMilli: integer("daily_rate_milli").notNull(),
    daysLeft: integer("days_left"),
    reorderQty: integer("reorder_qty").notNull().default(0),
    /** Last time a stock.low event fired for this row — dedupes alerts to once per crossing. */
    lowAlertedAt: timestamp("low_alerted_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("forecasts_tenant_outlet_variant_idx").on(table.tenantId, table.outletId, table.variantId),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();
