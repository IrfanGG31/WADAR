import {
  EXPENSE_CATEGORY_LABEL,
  type CreateWalletBody,
  type RecordExpenseBody,
  type SetWalletBalanceBody,
  type TransferBody,
  type UpdateWalletBody,
} from "@wadar/contracts";
import { emitEvent, insertAuditLog, withTenantContext, type Db, type Tx } from "@wadar/platform";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { normalizeKeyword } from "../domain/categorize.js";
import { postBalanceAdjustment, postExpense, postTransfer, reverse } from "../domain/posting.js";
import { categoryRules, expenses, expenseVoids } from "../db/schema.js";
import {
  accountBalances,
  ensureLedger,
  findEntryBySource,
  insertWallet,
  updateWalletRow,
  type Ledger,
  type WalletRow,
} from "../infra/ledger.repository.js";
import { postAndEmit } from "./post.js";

export interface FinanceContext {
  tenantId: string;
  actorUserId: string;
  correlationId: string;
}

export class FinanceError extends Error {
  constructor(
    readonly code: "WALLET_NOT_FOUND" | "EXPENSE_NOT_FOUND" | "ALREADY_VOIDED" | "DEFAULT_WALLET" | "NO_CHANGE",
    message: string,
    readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
  }
}

function requireWallet(ledger: Ledger, walletId: string, { allowArchived = false } = {}): WalletRow {
  const wallet = ledger.wallets.find((w) => w.id === walletId);
  if (!wallet || (!allowArchived && wallet.archivedAt !== null)) {
    throw new FinanceError("WALLET_NOT_FOUND", "Dompet tidak ditemukan.", 404);
  }
  return wallet;
}

/** PRD F2.2: nominal, kategori, dompet, catatan → Dr Beban / Cr Dompet. Learns keyword → category (F2.3). */
export async function recordExpense(db: Db, ctx: FinanceContext, body: RecordExpenseBody): Promise<{ expenseId: string }> {
  return withTenantContext(db, ctx.tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, ctx.tenantId);
    const wallet = requireWallet(ledger, body.walletId);
    const expenseAccountId = ledger.accountByCode.get(body.category)!;
    const expenseId = uuidv7();
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    const label = EXPENSE_CATEGORY_LABEL[body.category];
    const entryId = await postAndEmit(
      tx,
      postExpense(expenseAccountId, wallet.accountId, body.amount, body.note ? `${label}: ${body.note}` : label),
      { tenantId: ctx.tenantId, ledger, occurredAt, sourceType: "expense", sourceId: expenseId, createdBy: ctx.actorUserId, correlationId: ctx.correlationId },
    );
    await tx.insert(expenses).values({
      id: expenseId,
      tenantId: ctx.tenantId,
      amount: body.amount,
      category: body.category,
      walletId: wallet.id,
      note: body.note ?? null,
      occurredAt,
      entryId: entryId!,
      createdBy: ctx.actorUserId,
    });
    const keyword = body.note ? normalizeKeyword(body.note) : undefined;
    if (keyword) {
      await tx
        .insert(categoryRules)
        .values({ tenantId: ctx.tenantId, keyword, category: body.category })
        .onConflictDoUpdate({ target: [categoryRules.tenantId, categoryRules.keyword], set: { category: body.category, updatedAt: new Date() } });
    }
    await emitEvent(tx, {
      type: "finance.expense.recorded",
      tenantId: ctx.tenantId,
      aggregateType: "expense",
      aggregateId: expenseId,
      correlationId: ctx.correlationId,
      actor: { kind: "user", id: ctx.actorUserId },
      payload: { expenseId, amount: body.amount, category: body.category, walletId: wallet.id, occurredAt: occurredAt.toISOString() },
    });
    return { expenseId };
  });
}

export async function voidExpense(db: Db, ctx: FinanceContext, expenseId: string, reason: string): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    const [expense] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, expenseId)));
    if (!expense) throw new FinanceError("EXPENSE_NOT_FOUND", "Pengeluaran tidak ditemukan.", 404);
    const inserted = await tx
      .insert(expenseVoids)
      .values({ expenseId, tenantId: ctx.tenantId, reason, voidedBy: ctx.actorUserId })
      .onConflictDoNothing()
      .returning({ id: expenseVoids.expenseId });
    if (inserted.length === 0) throw new FinanceError("ALREADY_VOIDED", "Pengeluaran ini sudah dibatalkan.", 409);
    const ledger = await ensureLedger(tx, ctx.tenantId);
    const original = await findEntryBySource(tx, ctx.tenantId, "expense", expenseId);
    await postAndEmit(tx, reverse(original!.lines, `Batal pengeluaran: ${reason}`), {
      tenantId: ctx.tenantId,
      ledger,
      occurredAt: new Date(),
      sourceType: "expense_void",
      sourceId: expenseId,
      createdBy: ctx.actorUserId,
      correlationId: ctx.correlationId,
      reversalOf: { entryId: original!.entry.id, occurredAt: original!.entry.occurredAt },
    });
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: "expense.voided",
      entity: `expense:${expenseId}`,
      before: { amount: expense.amount, category: expense.category },
      after: { reason },
    });
  });
}

export async function createWallet(db: Db, ctx: FinanceContext, body: CreateWalletBody): Promise<{ walletId: string }> {
  return withTenantContext(db, ctx.tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, ctx.tenantId);
    const wallet = await insertWallet(tx, ctx.tenantId, body.name, body.type, null);
    ledger.wallets.push(wallet);
    ledger.accountById.set(wallet.accountId, { code: `wallet:${wallet.id}`, kind: "wallet", name: wallet.name });
    if (body.openingBalance > 0) {
      await postAndEmit(tx, postBalanceAdjustment(wallet.accountId, ledger.accounts.equity, body.openingBalance, `Saldo awal ${body.name}`), {
        tenantId: ctx.tenantId,
        ledger,
        occurredAt: new Date(),
        sourceType: "wallet_opening",
        sourceId: wallet.id,
        createdBy: ctx.actorUserId,
        correlationId: ctx.correlationId,
      });
    }
    return { walletId: wallet.id };
  });
}

export async function updateWallet(db: Db, ctx: FinanceContext, walletId: string, body: UpdateWalletBody): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, ctx.tenantId);
    const wallet = requireWallet(ledger, walletId, { allowArchived: true });
    if (body.archived && wallet.defaultFor) {
      throw new FinanceError("DEFAULT_WALLET", "Dompet ini dipakai Kasir, tidak bisa diarsipkan.");
    }
    await updateWalletRow(tx, ctx.tenantId, walletId, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
    });
  });
}

/** "Saldo sebenarnya": posts the difference so the wallet matches the real count (PRD §4 "aman untuk salah"). */
export async function setWalletBalance(db: Db, ctx: FinanceContext, walletId: string, body: SetWalletBalanceBody): Promise<{ delta: number }> {
  return withTenantContext(db, ctx.tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, ctx.tenantId);
    const wallet = requireWallet(ledger, walletId);
    const current = (await accountBalances(tx, ctx.tenantId, [wallet.accountId])).get(wallet.accountId) ?? 0;
    const delta = body.actualBalance - current;
    if (delta === 0) throw new FinanceError("NO_CHANGE", "Saldo sudah sama.");
    await postAndEmit(tx, postBalanceAdjustment(wallet.accountId, ledger.accounts.equity, delta, `Penyesuaian saldo ${wallet.name}${body.note ? `: ${body.note}` : ""}`), {
      tenantId: ctx.tenantId,
      ledger,
      occurredAt: new Date(),
      sourceType: "wallet_adjustment",
      sourceId: uuidv7(),
      createdBy: ctx.actorUserId,
      correlationId: ctx.correlationId,
    });
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: "wallet.balance_adjusted",
      entity: `wallet:${walletId}`,
      before: { balance: current },
      after: { balance: body.actualBalance, note: body.note ?? null },
    });
    return { delta };
  });
}

/** PRD F2.6: setor kas ke bank, tarik saldo marketplace. */
export async function transfer(db: Db, ctx: FinanceContext, body: TransferBody): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    const ledger = await ensureLedger(tx, ctx.tenantId);
    const from = requireWallet(ledger, body.fromWalletId);
    const to = requireWallet(ledger, body.toWalletId);
    await postAndEmit(tx, postTransfer(from.accountId, to.accountId, body.amount, `Pindah dana ${from.name} → ${to.name}${body.note ? `: ${body.note}` : ""}`), {
      tenantId: ctx.tenantId,
      ledger,
      occurredAt: new Date(),
      sourceType: "transfer",
      sourceId: uuidv7(),
      createdBy: ctx.actorUserId,
      correlationId: ctx.correlationId,
    });
  });
}

export async function ensureTenantLedger(tx: Tx, tenantId: string): Promise<void> {
  await ensureLedger(tx, tenantId);
}
