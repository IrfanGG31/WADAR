import {
  EXPENSE_CATEGORY_LABEL,
  type CategorySuggestion,
  type ExpenseCategory,
  type ExpenseView,
  type MoneyMovement,
  type ProfitAndLoss,
  type WalletView,
} from "@wadar/contracts";
import { withTenantContext, type Db, type Tx } from "@wadar/platform";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { suggestCategory } from "../domain/categorize.js";
import { profitFromKinds } from "../domain/posting.js";
import { categoryRules, expenses, expenseVoids } from "../db/schema.js";
import { accountBalances, ensureLedger, kindTotals, walletMovements } from "../infra/ledger.repository.js";

export async function listWallets(db: Db, tenantId: string, includeArchived = false): Promise<WalletView[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, tenantId);
    const balances = await accountBalances(tx, tenantId, ledger.wallets.map((w) => w.accountId));
    return ledger.wallets
      .filter((w) => includeArchived || w.archivedAt === null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        balance: balances.get(w.accountId) ?? 0,
        defaultFor: w.defaultFor,
        archived: w.archivedAt !== null,
      }));
  });
}

/** Port (also used by insights' reconciliation): P&L straight from the ledger for [from, to). */
export async function profitAndLossTx(tx: Tx, tenantId: string, from: Date, to: Date): Promise<ProfitAndLoss> {
  const rows = await kindTotals(tx, tenantId, from, to);
  const pnl = profitFromKinds(rows);
  const byCategory = new Map<string, number>();
  for (const row of rows.filter((r) => r.kind === "expense")) {
    byCategory.set(row.code, (byCategory.get(row.code) ?? 0) + row.debit - row.credit);
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...pnl,
    expensesByCategory: [...byCategory.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([category, amount]) => ({ category, label: EXPENSE_CATEGORY_LABEL[category as ExpenseCategory] ?? category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function profitAndLoss(db: Db, tenantId: string, from: Date, to: Date): Promise<ProfitAndLoss> {
  return withTenantContext(db, tenantId, (tx) => profitAndLossTx(tx, tenantId, from, to));
}

/** Port for insights' reconciliation: Σ of every wallet balance per the ledger. */
export async function totalWalletBalanceTx(tx: Tx, tenantId: string): Promise<number> {
  const ledger = await ensureLedger(tx, tenantId);
  const balances = await accountBalances(tx, tenantId, ledger.wallets.map((w) => w.accountId));
  return [...balances.values()].reduce((a, b) => a + b, 0);
}

export async function listMoneyMovements(
  db: Db,
  tenantId: string,
  filter: { from: Date; to: Date; walletId?: string; limit: number },
): Promise<MoneyMovement[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, tenantId);
    const scoped = filter.walletId ? ledger.wallets.filter((w) => w.id === filter.walletId) : ledger.wallets;
    const byAccount = new Map(scoped.map((w) => [w.accountId, w]));
    const rows = await walletMovements(tx, tenantId, {
      from: filter.from,
      to: filter.to,
      walletAccountIds: [...byAccount.keys()],
      limit: filter.limit,
    });
    return rows.map((row) => {
      const wallet = byAccount.get(row.accountId)!;
      return {
        entryId: row.entryId,
        occurredAt: row.occurredAt.toISOString(),
        description: row.description,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        walletId: wallet.id,
        walletName: wallet.name,
        amount: row.debit - row.credit,
      };
    });
  });
}

export async function listExpenses(db: Db, tenantId: string, from: Date, to: Date): Promise<ExpenseView[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, tenantId);
    const rows = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), gte(expenses.occurredAt, from), lt(expenses.occurredAt, to)))
      .orderBy(desc(expenses.occurredAt))
      .limit(200);
    const voided =
      rows.length === 0
        ? new Set<string>()
        : new Set(
            (
              await tx
                .select({ id: expenseVoids.expenseId })
                .from(expenseVoids)
                .where(and(eq(expenseVoids.tenantId, tenantId), inArray(expenseVoids.expenseId, rows.map((r) => r.id))))
            ).map((v) => v.id),
          );
    const walletName = new Map(ledger.wallets.map((w) => [w.id, w.name]));
    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      category: row.category as ExpenseCategory,
      categoryLabel: EXPENSE_CATEGORY_LABEL[row.category as ExpenseCategory] ?? row.category,
      walletId: row.walletId,
      walletName: walletName.get(row.walletId) ?? "",
      note: row.note,
      occurredAt: row.occurredAt.toISOString(),
      voided: voided.has(row.id),
    }));
  });
}

export async function suggestExpenseCategory(db: Db, tenantId: string, note: string): Promise<CategorySuggestion> {
  const rules = await withTenantContext(db, tenantId, (tx) =>
    tx.select().from(categoryRules).where(eq(categoryRules.tenantId, tenantId)),
  );
  return suggestCategory(note, new Map(rules.map((r) => [r.keyword, r.category as ExpenseCategory])));
}
