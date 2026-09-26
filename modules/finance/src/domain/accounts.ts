import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory, type WalletType } from "@wadar/contracts";

export type AccountKind =
  | "wallet"
  | "receivable"
  | "inventory"
  | "payable"
  | "equity"
  | "revenue"
  | "contra_revenue"
  | "cogs"
  | "commission"
  | "expense"
  | "other_income";

export interface AccountTemplate {
  code: string;
  name: string;
  kind: AccountKind;
}

/**
 * Per-tenant chart of accounts (ARCHITECTURE §5.2). Names are what "Mode
 * Lanjutan" shows; everyday UI only ever says "uang masuk/keluar/untung"
 * (PRD §4). Wallet accounts are created alongside their wallets.
 */
export const ACCOUNT_TEMPLATE: AccountTemplate[] = [
  { code: "receivable", name: "Piutang", kind: "receivable" },
  { code: "inventory", name: "Persediaan", kind: "inventory" },
  { code: "payable", name: "Hutang Usaha", kind: "payable" },
  { code: "equity", name: "Modal & Selisih Saldo", kind: "equity" },
  { code: "revenue", name: "Pendapatan Penjualan", kind: "revenue" },
  { code: "discount", name: "Diskon Penjualan", kind: "contra_revenue" },
  { code: "cogs", name: "Harga Pokok Penjualan (HPP)", kind: "cogs" },
  { code: "commission", name: "Komisi Kanal", kind: "commission" },
  { code: "other_income", name: "Pendapatan Lain-lain", kind: "other_income" },
  ...(Object.entries(EXPENSE_CATEGORY_LABEL) as Array<[ExpenseCategory, string]>).map(([code, name]) => ({
    code,
    name: `Beban ${name}`,
    kind: "expense" as const,
  })),
];

export interface WalletTemplate {
  name: string;
  type: WalletType;
  defaultFor: "cash" | "transfer" | "qris";
}

export const DEFAULT_WALLETS: WalletTemplate[] = [
  { name: "Kas Laci", type: "cash", defaultFor: "cash" },
  { name: "Rekening Bank", type: "bank", defaultFor: "transfer" },
  { name: "QRIS", type: "qris", defaultFor: "qris" },
];
