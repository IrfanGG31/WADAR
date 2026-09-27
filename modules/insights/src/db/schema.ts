import { tenantRlsPolicy } from "@wadar/platform";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const insightsSchema = pgSchema("insights");

const rupiah = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

/**
 * Read models (ARCHITECTURE §5.4 CQRS ringan): maintained ONLY from events,
 * so dashboards never query transaction tables. `day` is the tenant-local
 * business day. These are projections — upserted with increments, and
 * rebuildable by replaying events.
 */
export const dailySalesAgg = insightsSchema.table(
  "daily_sales_agg",
  {
    tenantId: uuid("tenant_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    day: text("day").notNull(),
    orders: integer("orders").notNull().default(0),
    gross: rupiah("gross"),
    discount: rupiah("discount"),
    net: rupiah("net"),
    cost: rupiah("cost"),
    commission: rupiah("commission"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.outletId, table.day] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const dailyProductAgg = insightsSchema.table(
  "daily_product_agg",
  {
    tenantId: uuid("tenant_id").notNull(),
    day: text("day").notNull(),
    variantId: uuid("variant_id").notNull(),
    productId: uuid("product_id").notNull(),
    name: text("name").notNull(),
    qty: integer("qty").notNull().default(0),
    net: rupiah("net"),
    cost: rupiah("cost"),
    commission: rupiah("commission"),
    /** Units sold with unknown HPP (unitCost 0) — flags overstated profit. */
    qtyWithoutCost: integer("qty_without_cost").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.day, table.variantId] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const dailyChannelAgg = insightsSchema.table(
  "daily_channel_agg",
  {
    tenantId: uuid("tenant_id").notNull(),
    day: text("day").notNull(),
    channel: text("channel").notNull(),
    orders: integer("orders").notNull().default(0),
    net: rupiah("net"),
    cost: rupiah("cost"),
    commission: rupiah("commission"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.day, table.channel] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

/** From finance.entry.posted — the ledger's view, so cards reconcile with it exactly. */
export const dailyCashflowAgg = insightsSchema.table(
  "daily_cashflow_agg",
  {
    tenantId: uuid("tenant_id").notNull(),
    day: text("day").notNull(),
    moneyIn: rupiah("money_in"),
    moneyOut: rupiah("money_out"),
    sales: rupiah("sales"),
    discounts: rupiah("discounts"),
    cogs: rupiah("cogs"),
    commission: rupiah("commission"),
    expenses: rupiah("expenses"),
    otherIncome: rupiah("other_income"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.day] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const dailyExpenseAgg = insightsSchema.table(
  "daily_expense_agg",
  {
    tenantId: uuid("tenant_id").notNull(),
    day: text("day").notNull(),
    category: text("category").notNull(),
    amount: rupiah("amount"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.day, table.category] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const walletBalances = insightsSchema.table(
  "wallet_balances",
  {
    tenantId: uuid("tenant_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.walletId] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const alerts = insightsSchema.table(
  "alerts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("alerts_tenant_dedupe_idx").on(table.tenantId, table.dedupeKey),
    index("alerts_tenant_open_idx").on(table.tenantId, table.createdAt).where(sql`${table.resolvedAt} is null`),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/** Nightly "agregat vs ledger" check (BUILD-PLAN M6, ARCHITECTURE §5.4). */
export const reconciliationRuns = insightsSchema.table(
  "reconciliation_runs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    day: text("day").notNull(),
    ok: boolean("ok").notNull(),
    details: jsonb("details").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reconciliation_runs_tenant_day_idx").on(table.tenantId, table.day), tenantRlsPolicy(table.tenantId)],
).enableRLS();
