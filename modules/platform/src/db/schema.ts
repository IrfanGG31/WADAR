import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const platformSchema = pgSchema("platform");

export const outboxStatus = pgEnum("outbox_status", ["pending", "published"]);

/**
 * Source of truth for every domain event (docs/ARCHITECTURE.md §4.3).
 * tenant_id is an explicit indexed column (not just inside `payload`) so ops
 * queries like "pending outbox rows for tenant X" don't need to parse JSON —
 * see docs/BUILD-PLAN.md M0 plan notes.
 */
export const outbox = platformSchema.table(
  "outbox",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("outbox_tenant_id_idx").on(table.tenantId),
    index("outbox_status_idx").on(table.status),
  ],
);

/**
 * Idempotency guard for event consumers. Composite PK is the real safety net —
 * a concurrent duplicate insert fails the transaction, not just a "check first"
 * read (docs/ARCHITECTURE.md §4.3, ADR-005: at-least-once delivery, idempotent
 * consumer).
 */
export const processedEvents = platformSchema.table(
  "processed_events",
  {
    consumer: text("consumer").notNull(),
    eventId: uuid("event_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.consumer, table.eventId] }),
    index("processed_events_tenant_id_idx").on(table.tenantId),
  ],
);

/** HTTP idempotency guard for POST endpoints (CLAUDE.md aturan #6, ARCHITECTURE §11). */
export const idempotencyKeys = platformSchema.table(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    responseSnapshot: jsonb("response_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idempotency_keys_tenant_id_idx").on(table.tenantId)],
);

export const auditLog = platformSchema.table(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_tenant_id_idx").on(table.tenantId)],
);

/**
 * Auto-approve rules for AI action proposals (docs/ARCHITECTURE.md §7.6, added
 * v1.1 ambiguity-resolution). Schema only in M0 — the orchestrator that reads
 * it is built in M8.
 */
export const autoApproveRules = platformSchema.table(
  "auto_approve_rules",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    tool: text("tool").notNull(),
    condition: jsonb("condition").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("auto_approve_rules_tenant_id_idx").on(table.tenantId)],
);

/**
 * Dummy aggregate used only by M0's "ping" command to exercise/prove the
 * outbox + idempotency pattern end-to-end. Not a real business table — later
 * milestones' aggregates live in their own module schemas, not here.
 */
export const pings = platformSchema.table(
  "pings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pings_tenant_id_idx").on(table.tenantId)],
);

export const pingsRelations = relations(pings, () => ({}));
