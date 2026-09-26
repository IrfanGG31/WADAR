import { tenantRlsPolicy } from "@wadar/platform";
import { bigint, index, integer, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const salesSchema = pgSchema("sales");

export const salesChannel = salesSchema.enum("sales_channel", ["pos", "whatsapp", "shopee", "tiktok", "tokopedia", "other"]);
export const paymentMethod = salesSchema.enum("payment_method", ["cash", "transfer", "qris", "ewallet"]);

const rupiah = (name: string) => bigint(name, { mode: "number" });

/**
 * Completed orders are immutable (CLAUDE.md aturan #4): payment status is
 * derived from `order_payments`, cancellation is a row in `order_voids`.
 * Totals are snapshotted at completion so later price/HPP edits never
 * rewrite history.
 */
export const orders = salesSchema.table(
  "orders",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    orderNumber: text("order_number").notNull(),
    channel: salesChannel("channel").notNull(),
    /** Client Idempotency-Key — the DB-level guarantee behind "same request twice = one order". */
    idempotencyKey: text("idempotency_key").notNull(),
    customerId: uuid("customer_id"),
    note: text("note"),
    gross: rupiah("gross").notNull(),
    discount: rupiah("discount").notNull(),
    net: rupiah("net").notNull(),
    cost: rupiah("cost").notNull(),
    commission: rupiah("commission").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_tenant_idempotency_key_idx").on(table.tenantId, table.idempotencyKey),
    uniqueIndex("orders_tenant_order_number_idx").on(table.tenantId, table.orderNumber),
    index("orders_tenant_completed_at_idx").on(table.tenantId, table.completedAt),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

export const orderLines = salesSchema.table(
  "order_lines",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    variantId: uuid("variant_id").notNull(),
    productId: uuid("product_id").notNull(),
    /** Product + variant name at sale time. */
    name: text("name").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: rupiah("unit_price").notNull(),
    lineDiscount: rupiah("line_discount").notNull(),
    /** lineDiscount + allocated share of the order discount. */
    discount: rupiah("discount").notNull(),
    netAmount: rupiah("net_amount").notNull(),
    unitCost: rupiah("unit_cost").notNull(),
    commission: rupiah("commission").notNull(),
  },
  (table) => [index("order_lines_tenant_order_idx").on(table.tenantId, table.orderId), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const orderPayments = salesSchema.table(
  "order_payments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    method: paymentMethod("method").notNull(),
    /** Amount applied to the order (never more than what was owed). */
    amount: rupiah("amount").notNull(),
    /** Cash handed over (for change); null for non-cash. */
    tendered: rupiah("tendered"),
    walletId: uuid("wallet_id"),
    /** payments.incoming_payments id when this came from the payment listener. */
    externalPaymentId: uuid("external_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_payments_tenant_order_idx").on(table.tenantId, table.orderId),
    uniqueIndex("order_payments_external_payment_idx").on(table.externalPaymentId),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

export const orderVoids = salesSchema.table(
  "order_voids",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    reason: text("reason").notNull(),
    voidedBy: text("voided_by").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("order_voids_order_idx").on(table.orderId), tenantRlsPolicy(table.tenantId)],
).enableRLS();

/** Configuration (updatable): commission a marketplace/ojol channel takes (PRD F3.3). */
export const channelSettings = salesSchema.table(
  "channel_settings",
  {
    tenantId: uuid("tenant_id").notNull(),
    channel: salesChannel("channel").notNull(),
    commissionBps: integer("commission_bps").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.channel] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

/** Per-tenant, per-local-day sequence for human-friendly order numbers. */
export const orderCounters = salesSchema.table(
  "order_counters",
  {
    tenantId: uuid("tenant_id").notNull(),
    dayKey: text("day_key").notNull(),
    lastValue: integer("last_value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.dayKey] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();
