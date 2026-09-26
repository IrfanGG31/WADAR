import type { Tx } from "@wadar/platform";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { ACCOUNT_TEMPLATE, DEFAULT_WALLETS, type AccountKind } from "../domain/accounts.js";
import type { LedgerAccounts, PostingLine } from "../domain/posting.js";
import { accounts, journalEntries, journalLines, wallets } from "../db/schema.js";

export type WalletRow = typeof wallets.$inferSelect;
export type EntryRow = typeof journalEntries.$inferSelect;

export interface Ledger {
  accounts: LedgerAccounts;
  accountById: Map<string, { code: string; kind: AccountKind; name: string }>;
  accountByCode: Map<string, string>;
  wallets: WalletRow[];
}

async function loadLedger(tx: Tx, tenantId: string): Promise<Ledger | undefined> {
  const [accountRows, walletRows] = await Promise.all([
    tx.select().from(accounts).where(eq(accounts.tenantId, tenantId)),
    tx.select().from(wallets).where(eq(wallets.tenantId, tenantId)),
  ]);
  const byCode = new Map(accountRows.map((a) => [a.code, a.id]));
  if (walletRows.length === 0 || ACCOUNT_TEMPLATE.some((t) => !byCode.has(t.code))) return undefined;
  const need = (code: string) => byCode.get(code)!;
  return {
    accounts: {
      receivable: need("receivable"),
      inventory: need("inventory"),
      equity: need("equity"),
      revenue: need("revenue"),
      discount: need("discount"),
      cogs: need("cogs"),
      commission: need("commission"),
      otherIncome: need("other_income"),
    },
    accountById: new Map(accountRows.map((a) => [a.id, { code: a.code, kind: a.kind, name: a.name }])),
    accountByCode: byCode,
    wallets: walletRows,
  };
}

/**
 * Chart of accounts + default wallets, created on first use (ARCHITECTURE
 * §5.2 says "at tenant.created"; doing it lazily as well means tenants that
 * existed before finance shipped get a ledger too). A per-tenant advisory
 * lock makes concurrent first uses safe.
 */
export async function ensureLedger(tx: Tx, tenantId: string): Promise<Ledger> {
  const existing = await loadLedger(tx, tenantId);
  if (existing) return existing;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`finance-ledger:${tenantId}`}))`);
  const again = await loadLedger(tx, tenantId);
  if (again) return again;

  await tx
    .insert(accounts)
    .values(ACCOUNT_TEMPLATE.map((t) => ({ id: uuidv7(), tenantId, code: t.code, name: t.name, kind: t.kind })))
    .onConflictDoNothing();
  const walletCount = await tx.select({ id: wallets.id }).from(wallets).where(eq(wallets.tenantId, tenantId));
  if (walletCount.length === 0) {
    for (const template of DEFAULT_WALLETS) {
      await insertWallet(tx, tenantId, template.name, template.type, template.defaultFor);
    }
  }
  return (await loadLedger(tx, tenantId))!;
}

export async function insertWallet(
  tx: Tx,
  tenantId: string,
  name: string,
  type: WalletRow["type"],
  defaultFor: WalletRow["defaultFor"],
): Promise<WalletRow> {
  const walletId = uuidv7();
  const accountId = uuidv7();
  await tx.insert(accounts).values({ id: accountId, tenantId, code: `wallet:${walletId}`, name, kind: "wallet" });
  const [row] = await tx.insert(wallets).values({ id: walletId, tenantId, accountId, name, type, defaultFor }).returning();
  return row!;
}

export async function updateWalletRow(tx: Tx, tenantId: string, walletId: string, patch: Partial<Pick<WalletRow, "name" | "archivedAt" | "defaultFor">>) {
  await tx.update(wallets).set(patch).where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, walletId)));
  if (patch.name) {
    const [wallet] = await tx.select().from(wallets).where(and(eq(wallets.tenantId, tenantId), eq(wallets.id, walletId)));
    if (wallet) await tx.update(accounts).set({ name: patch.name }).where(eq(accounts.id, wallet.accountId));
  }
}

export interface NewEntry {
  tenantId: string;
  occurredAt: Date;
  sourceType: string;
  sourceId: string;
  description: string;
  reversalOf?: string;
  createdBy: string;
  lines: PostingLine[];
}

/** Inserts an entry + lines; returns undefined if this source was already posted (idempotent). */
export async function insertEntry(tx: Tx, entry: NewEntry): Promise<string | undefined> {
  const id = uuidv7();
  const inserted = await tx
    .insert(journalEntries)
    .values({
      id,
      tenantId: entry.tenantId,
      occurredAt: entry.occurredAt,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      description: entry.description,
      reversalOf: entry.reversalOf ?? null,
      createdBy: entry.createdBy,
    })
    .onConflictDoNothing()
    .returning({ id: journalEntries.id });
  if (inserted.length === 0) return undefined;
  await tx.insert(journalLines).values(
    entry.lines.map((l) => ({ id: uuidv7(), tenantId: entry.tenantId, entryId: id, accountId: l.accountId, debit: l.debit, credit: l.credit })),
  );
  return id;
}

export async function findEntryBySource(tx: Tx, tenantId: string, sourceType: string, sourceId: string) {
  const [entry] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId)));
  if (!entry) return undefined;
  const lines = await tx
    .select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines)
    .where(and(eq(journalLines.tenantId, tenantId), eq(journalLines.entryId, entry.id)));
  return { entry, lines };
}

export async function accountBalances(tx: Tx, tenantId: string, accountIds: string[]): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();
  const rows = await tx
    .select({ accountId: journalLines.accountId, balance: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})` })
    .from(journalLines)
    .where(and(eq(journalLines.tenantId, tenantId), inArray(journalLines.accountId, accountIds)))
    .groupBy(journalLines.accountId);
  return new Map(rows.map((r) => [r.accountId, Number(r.balance)]));
}

/**
 * Σ debit/credit per account for entries whose BUSINESS time is in
 * [from, to). A reversal counts on the day of the entry it reverses, so
 * voiding yesterday's sale corrects yesterday's profit — the same rule
 * insights uses for its daily aggregates.
 */
export async function kindTotals(tx: Tx, tenantId: string, from: Date, to: Date) {
  const original = alias(journalEntries, "original");
  const businessTime = sql`coalesce(${original.occurredAt}, ${journalEntries.occurredAt})`;
  const rows = await tx
    .select({
      kind: accounts.kind,
      code: accounts.code,
      debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .leftJoin(original, eq(original.id, journalEntries.reversalOf))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(and(eq(journalLines.tenantId, tenantId), gte(businessTime, from), lt(businessTime, to)))
    .groupBy(accounts.kind, accounts.code);
  return rows.map((r) => ({ kind: r.kind, code: r.code, debit: Number(r.debit), credit: Number(r.credit) }));
}

export async function walletMovements(
  tx: Tx,
  tenantId: string,
  filter: { from: Date; to: Date; walletAccountIds: string[]; limit: number },
) {
  if (filter.walletAccountIds.length === 0) return [];
  return tx
    .select({
      entryId: journalEntries.id,
      occurredAt: journalEntries.occurredAt,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.tenantId, tenantId),
        inArray(journalLines.accountId, filter.walletAccountIds),
        gte(journalEntries.occurredAt, filter.from),
        lt(journalEntries.occurredAt, filter.to),
      ),
    )
    .orderBy(desc(journalEntries.occurredAt), desc(journalEntries.id))
    .limit(filter.limit);
}

export function activeWallets(ledger: Ledger): WalletRow[] {
  return ledger.wallets.filter((w) => w.archivedAt === null);
}
