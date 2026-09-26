import { tenantRlsPolicy } from "@wadar/platform";
import { bigint, index, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const paymentsSchema = pgSchema("payments");

export const intentStatus = paymentsSchema.enum("intent_status", ["pending", "paid", "expired"]);
export const incomingMethod = paymentsSchema.enum("incoming_method", ["cash", "transfer", "qris", "ewallet"]);

const rupiah = (name: string) => bigint(name, { mode: "number" });

/** A request to be paid (a dynamic QRIS). Workflow state, so `status` is updatable. */
export const paymentIntents = paymentsSchema.table(
  "payment_intents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id"),
    amount: rupiah("amount").notNull(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    qrString: text("qr_string").notNull(),
    status: intentStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_intents_tenant_order_idx").on(table.tenantId, table.orderId),
    index("payment_intents_status_idx").on(table.status, table.createdAt),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/**
 * Raw webhook bodies, unique per provider event id (ARCHITECTURE §6.1):
 * the dedupe that makes "webhook duplikat tidak membuat posting ganda"
 * true even before processed_events is involved.
 */
export const providerEvents = paymentsSchema.table(
  "provider_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_events_provider_event_idx").on(table.provider, table.providerEventId),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/** Money that actually arrived — append-only (CLAUDE.md aturan #4). */
export const incomingPayments = paymentsSchema.table(
  "incoming_payments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    intentId: uuid("intent_id"),
    orderId: uuid("order_id"),
    amount: rupiah("amount").notNull(),
    method: incomingMethod("method").notNull(),
    source: text("source").notNull(),
    reference: text("reference"),
    providerEventId: uuid("provider_event_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("incoming_payments_tenant_received_idx").on(table.tenantId, table.receivedAt),
    uniqueIndex("incoming_payments_intent_idx").on(table.intentId),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();
