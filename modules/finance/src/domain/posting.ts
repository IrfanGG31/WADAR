import type { AccountKind } from "./accounts.js";

export interface PostingLine {
  accountId: string;
  debit: number;
  credit: number;
}

export interface PostingEntry {
  description: string;
  lines: PostingLine[];
}

export class UnbalancedEntryError extends Error {}

/** Drops zero lines, merges same-account lines, and asserts Σdebit = Σcredit. */
export function finalize(entry: PostingEntry): PostingEntry {
  const merged = new Map<string, { debit: number; credit: number }>();
  for (const line of entry.lines) {
    if (line.debit < 0 || line.credit < 0 || !Number.isInteger(line.debit) || !Number.isInteger(line.credit)) {
      throw new UnbalancedEntryError(`invalid amounts on ${line.accountId}`);
    }
    const current = merged.get(line.accountId) ?? { debit: 0, credit: 0 };
    current.debit += line.debit;
    current.credit += line.credit;
    merged.set(line.accountId, current);
  }
  const lines: PostingLine[] = [];
  for (const [accountId, { debit, credit }] of merged) {
    const net = debit - credit;
    if (net > 0) lines.push({ accountId, debit: net, credit: 0 });
    else if (net < 0) lines.push({ accountId, debit: 0, credit: -net });
  }
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit) throw new UnbalancedEntryError(`unbalanced: debit ${debit} ≠ credit ${credit}`);
  return { description: entry.description, lines };
}

export interface LedgerAccounts {
  receivable: string;
  inventory: string;
  equity: string;
  revenue: string;
  discount: string;
  cogs: string;
  commission: string;
  otherIncome: string;
}

export interface OrderForPosting {
  orderNumber: string;
  gross: number;
  discount: number;
  cost: number;
  commission: number;
  payments: Array<{ walletAccountId: string; amount: number }>;
  outstanding: number;
}

/**
 * ARCHITECTURE §5.2: Dr Kas / Cr Pendapatan (+ Dr Diskon), Dr HPP / Cr
 * Persediaan. Unpaid remainder (QRIS pending, marketplace) sits in Piutang;
 * the channel commission reduces whatever holds the money (the receivable
 * first, then the receiving wallet).
 */
export function postOrderCompleted(accounts: LedgerAccounts, order: OrderForPosting): PostingEntry {
  const lines: PostingLine[] = [
    { accountId: accounts.revenue, debit: 0, credit: order.gross },
    { accountId: accounts.discount, debit: order.discount, credit: 0 },
    { accountId: accounts.receivable, debit: order.outstanding, credit: 0 },
    ...order.payments.map((p) => ({ accountId: p.walletAccountId, debit: p.amount, credit: 0 })),
    { accountId: accounts.cogs, debit: order.cost, credit: 0 },
    { accountId: accounts.inventory, debit: 0, credit: order.cost },
  ];
  if (order.commission > 0) {
    const holder = order.outstanding > 0 ? accounts.receivable : (order.payments[0]?.walletAccountId ?? accounts.receivable);
    lines.push({ accountId: accounts.commission, debit: order.commission, credit: 0 });
    lines.push({ accountId: holder, debit: 0, credit: order.commission });
  }
  return finalize({ description: `Penjualan #${order.orderNumber}`, lines });
}

/** Append-only correction (CLAUDE.md aturan #4): the mirror image of the original lines. */
export function reverse(original: PostingLine[], description: string): PostingEntry {
  return finalize({
    description,
    lines: original.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
  });
}

export function postPaymentReceived(
  accounts: LedgerAccounts,
  payment: { walletAccountId: string; amount: number; appliedToOrder: number; description: string },
): PostingEntry {
  const extra = payment.amount - payment.appliedToOrder;
  return finalize({
    description: payment.description,
    lines: [
      { accountId: payment.walletAccountId, debit: payment.amount, credit: 0 },
      { accountId: accounts.receivable, debit: 0, credit: payment.appliedToOrder },
      { accountId: accounts.otherIncome, debit: 0, credit: extra },
    ],
  });
}

export function postExpense(expenseAccountId: string, walletAccountId: string, amount: number, description: string): PostingEntry {
  return finalize({
    description,
    lines: [
      { accountId: expenseAccountId, debit: amount, credit: 0 },
      { accountId: walletAccountId, debit: 0, credit: amount },
    ],
  });
}

export function postTransfer(fromAccountId: string, toAccountId: string, amount: number, description: string): PostingEntry {
  return finalize({
    description,
    lines: [
      { accountId: toAccountId, debit: amount, credit: 0 },
      { accountId: fromAccountId, debit: 0, credit: amount },
    ],
  });
}

/** Opening balance or "saldo sebenarnya" correction: the difference goes to equity. */
export function postBalanceAdjustment(walletAccountId: string, equityAccountId: string, delta: number, description: string): PostingEntry {
  return finalize({
    description,
    lines:
      delta >= 0
        ? [
            { accountId: walletAccountId, debit: delta, credit: 0 },
            { accountId: equityAccountId, debit: 0, credit: delta },
          ]
        : [
            { accountId: equityAccountId, debit: -delta, credit: 0 },
            { accountId: walletAccountId, debit: 0, credit: -delta },
          ],
  });
}

export interface KindTotals {
  sales: number;
  discounts: number;
  costOfGoods: number;
  channelCommission: number;
  expenses: number;
  otherIncome: number;
}

/** P&L from per-kind debit/credit sums — the single definition of "untung bersih". */
export function profitFromKinds(rows: Array<{ kind: AccountKind; debit: number; credit: number }>): KindTotals & { netSales: number; netProfit: number } {
  const sum = (kind: AccountKind, side: "debit" | "credit") =>
    rows.filter((r) => r.kind === kind).reduce((s, r) => s + (side === "debit" ? r.debit - r.credit : r.credit - r.debit), 0);
  const totals = {
    sales: sum("revenue", "credit"),
    discounts: sum("contra_revenue", "debit"),
    costOfGoods: sum("cogs", "debit"),
    channelCommission: sum("commission", "debit"),
    expenses: sum("expense", "debit"),
    otherIncome: sum("other_income", "credit"),
  };
  const netSales = totals.sales - totals.discounts;
  return {
    ...totals,
    netSales,
    netProfit: netSales - totals.costOfGoods - totals.channelCommission - totals.expenses + totals.otherIncome,
  };
}
