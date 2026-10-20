/**
 * Jurnal (ADR-006): account balances from `journal_balances` → the two statements an UMKM owner
 * reads. Pure and integer: amounts are whole rupiah summed with BigInt. The ledger itself is
 * balanced by construction (a trigger refuses unbalanced entries); `balanced` re-checks the
 * accounting equation so a screen can say so.
 */
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface AccountBalanceRow {
  account_code: string;
  name: string;
  type: AccountType;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface StatementLine {
  code: string;
  name: string;
  amount: number;
}

export interface ProfitAndLoss {
  revenue: StatementLine[];
  expenses: StatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  /** Profit since the shop started, up to the end date (not closed into equity yet). */
  retainedProfit: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

const toBig = (n: number) => BigInt(Math.trunc(n));
/** Debit-normal accounts (assets, expenses) grow with debits; the rest with credits. */
const debitNormal = (type: AccountType) => type === "asset" || type === "expense";

function signed(row: AccountBalanceRow, which: "period" | "closing"): bigint {
  const d = toBig(which === "period" ? row.period_debit : row.closing_debit);
  const c = toBig(which === "period" ? row.period_credit : row.closing_credit);
  return debitNormal(row.type) ? d - c : c - d;
}

const sum = (xs: readonly bigint[]) => xs.reduce((a, b) => a + b, 0n);

export function profitAndLoss(rows: readonly AccountBalanceRow[], which: "period" | "closing" = "period"): ProfitAndLoss {
  const pick = (type: AccountType) => rows.filter((r) => r.type === type).map((r) => ({ row: r, amount: signed(r, which) }));
  const revenue = pick("revenue");
  const expenses = pick("expense");
  const totalRevenue = sum(revenue.map((x) => x.amount));
  const totalExpenses = sum(expenses.map((x) => x.amount));
  const line = (x: { row: AccountBalanceRow; amount: bigint }): StatementLine => ({ code: x.row.account_code, name: x.row.name, amount: Number(x.amount) });
  return {
    revenue: revenue.map(line),
    expenses: expenses.map(line),
    totalRevenue: Number(totalRevenue),
    totalExpenses: Number(totalExpenses),
    netProfit: Number(totalRevenue - totalExpenses),
  };
}

export function balanceSheet(rows: readonly AccountBalanceRow[]): BalanceSheet {
  const section = (type: AccountType) => rows.filter((r) => r.type === type).map((r) => ({ code: r.account_code, name: r.name, amount: signed(r, "closing") }));
  const assets = section("asset");
  const liabilities = section("liability");
  const equity = section("equity");
  const retained = BigInt(profitAndLoss(rows, "closing").netProfit);
  const totalAssets = sum(assets.map((a) => a.amount));
  const totalRight = sum(liabilities.map((l) => l.amount)) + sum(equity.map((e) => e.amount)) + retained;
  const out = (xs: { code: string; name: string; amount: bigint }[]) => xs.map((x) => ({ ...x, amount: Number(x.amount) }));
  return {
    assets: out(assets),
    liabilities: out(liabilities),
    equity: out(equity),
    retainedProfit: Number(retained),
    totalAssets: Number(totalAssets),
    totalLiabilitiesAndEquity: Number(totalRight),
    balanced: totalAssets === totalRight,
  };
}

/**
 * Stock value in the ledger vs on the shelf (Σ on hand × average cost). The average cost is a whole
 * rupiah, so they drift by at most Rp0,5 per unit; more than that means a movement the journal does
 * not know about (or one booked without a cost).
 */
export function stockReconciliation(ledger: number, shelf: number, units: number): { difference: number; withinRounding: boolean } {
  const difference = ledger - shelf;
  return { difference, withinRounding: Math.abs(difference) * 2 <= Math.max(units, 0) };
}

/** Σ on hand × average cost over every variant (negative stock counts negative, like the ledger). */
export function shelfStock(variants: readonly { on_hand: number; avg_cost: number }[]): { value: number; units: number } {
  let value = 0n;
  let units = 0;
  for (const v of variants) {
    value += BigInt(Math.trunc(v.on_hand)) * BigInt(Math.trunc(v.avg_cost));
    units += Math.abs(v.on_hand);
  }
  return { value: Number(value), units };
}

export const ENTRY_SOURCE_LABEL: Record<string, string> = {
  sale: "Penjualan",
  sale_void: "Batal jual",
  expense: "Pengeluaran",
  expense_void: "Batal biaya",
  purchase_receipt: "Barang datang",
  purchase_payment: "Bayar pemasok",
  stock_in: "Stok masuk",
  stock_adjustment: "Penyesuaian stok",
};
