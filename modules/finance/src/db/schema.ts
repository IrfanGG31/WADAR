import { tenantRlsPolicy } from "@wadar/platform";
import { sql } from "drizzle-orm";
import { bigint, check, index, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const financeSchema = pgSchema("finance");

export const accountKind = financeSchema.enum("account_kind", [
  "wallet",
  "receivable",
  "inventory",
  "payable",
  "equity",
  "revenue",
  "contra_revenue",
  "cogs",
  "commission",
  "expense",
  "other_income",
]);
export const walletType = financeSchema.enum("wallet_type", ["cash", "bank", "ewallet", "qris", "marketplace"]);
export const walletDefaultFor = financeSchema.enum("wallet_default_for", ["cash", "transfer", "qris"]);

const rupiah = (name: string) => bigint(name, { mode: "number" });

export const accounts = financeSchema.table(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    /** Stable per-tenant code ("revenue", "exp_rent", "wallet:<id>") — never shown to users. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: accountKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("accounts_tenant_code_idx").on(table.tenantId, table.code), tenantRlsPolicy(table.tenantId)],
).enableRLS();

/** User-facing view of a cash/bank/e-wallet account (PRD F2.5 "dompet"). */
export const wallets = financeSchema.table(
  "wallets",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    name: text("name").notNull(),
    type: walletType("type").notNull(),
    defaultFor: walletDefaultFor("default_for"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("wallets_account_idx").on(table.accountId),
    uniqueIndex("wallets_tenant_default_idx").on(table.tenantId, table.defaultFor).where(sql`${table.defaultFor} is not null`),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/**
 * Double-entry journal (ARCHITECTURE §5.2). Append-only and balanced —
 * both enforced by triggers in the custom migration, not just app code.
 * (source_type, source_id) is unique so a re-delivered event can never
 * post twice even if processed_events were bypassed.
 */
export const journalEntries = financeSchema.table(
  "journal_entries",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    description: text("description").notNull(),
    reversalOf: uuid("reversal_of"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("journal_entries_source_idx").on(table.tenantId, table.sourceType, table.sourceId),
    index("journal_entries_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

export const journalLines = financeSchema.table(
  "journal_lines",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: rupiah("debit").notNull().default(0),
    credit: rupiah("credit").notNull().default(0),
  },
  (table) => [
    index("journal_lines_tenant_entry_idx").on(table.tenantId, table.entryId),
    index("journal_lines_tenant_account_idx").on(table.tenantId, table.accountId),
    check("journal_lines_one_side", sql`(${table.debit} = 0) <> (${table.credit} = 0) and ${table.debit} >= 0 and ${table.credit} >= 0`),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

export const expenses = financeSchema.table(
  "expenses",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    amount: rupiah("amount").notNull(),
    category: text("category").notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    note: text("note"),
    receiptPhotoPath: text("receipt_photo_path"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    entryId: uuid("entry_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("expenses_tenant_occurred_idx").on(table.tenantId, table.occurredAt), tenantRlsPolicy(table.tenantId)],
).enableRLS();

export const expenseVoids = financeSchema.table(
  "expense_voids",
  {
    expenseId: uuid("expense_id")
      .primaryKey()
      .references(() => expenses.id),
    tenantId: uuid("tenant_id").notNull(),
    reason: text("reason").notNull(),
    voidedBy: text("voided_by").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantRlsPolicy(table.tenantId)],
).enableRLS();

/** Learned keyword → category (PRD F2.3: "konfirmasi sekali lalu sistem belajar"). */
export const categoryRules = financeSchema.table(
  "category_rules",
  {
    tenantId: uuid("tenant_id").notNull(),
    keyword: text("keyword").notNull(),
    category: text("category").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.keyword] }), tenantRlsPolicy(table.tenantId)],
).enableRLS();
