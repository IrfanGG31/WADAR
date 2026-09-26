import { z } from "zod";
import { Rupiah } from "@wadar/contracts/common";

export const WalletType = z.enum(["cash", "bank", "ewallet", "qris", "marketplace"]);
export type WalletType = z.infer<typeof WalletType>;

export const WALLET_TYPE_LABEL: Record<WalletType, string> = {
  cash: "Tunai",
  bank: "Rekening bank",
  ewallet: "E-wallet",
  qris: "QRIS",
  marketplace: "Saldo marketplace",
};

/** Built-in expense categories (PRD F2.2) — the account codes finance seeds per tenant. */
export const ExpenseCategory = z.enum([
  "exp_supplies",
  "exp_operational",
  "exp_salary",
  "exp_rent",
  "exp_utilities",
  "exp_ads",
  "exp_shipping",
  "exp_other",
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  exp_supplies: "Bahan & perlengkapan",
  exp_operational: "Operasional",
  exp_salary: "Gaji",
  exp_rent: "Sewa",
  exp_utilities: "Listrik, air & internet",
  exp_ads: "Iklan & promosi",
  exp_shipping: "Ongkir",
  exp_other: "Lain-lain",
};

export const RecordExpenseBody = z.object({
  amount: Rupiah.refine((v) => v > 0, "Nominal harus lebih dari 0"),
  category: ExpenseCategory,
  walletId: z.uuid(),
  note: z.string().trim().max(300).optional(),
  /** Defaults to now; allows back-dating a forgotten expense. */
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
export type RecordExpenseBody = z.infer<typeof RecordExpenseBody>;

export const VoidExpenseBody = z.object({ reason: z.string().trim().min(3).max(300) });
export type VoidExpenseBody = z.infer<typeof VoidExpenseBody>;

export const CreateWalletBody = z.object({
  name: z.string().trim().min(2).max(60),
  type: WalletType,
  openingBalance: Rupiah.default(0),
});
export type CreateWalletBody = z.infer<typeof CreateWalletBody>;

export const UpdateWalletBody = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  archived: z.boolean().optional(),
});
export type UpdateWalletBody = z.infer<typeof UpdateWalletBody>;

/** "Saldo sebenarnya" — posts the difference so the wallet matches reality. */
export const SetWalletBalanceBody = z.object({
  actualBalance: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  note: z.string().trim().max(300).optional(),
});
export type SetWalletBalanceBody = z.infer<typeof SetWalletBalanceBody>;

export const TransferBody = z
  .object({
    fromWalletId: z.uuid(),
    toWalletId: z.uuid(),
    amount: Rupiah.refine((v) => v > 0, "Nominal harus lebih dari 0"),
    note: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.fromWalletId !== b.toWalletId, { message: "Dompet asal dan tujuan harus beda", path: ["toWalletId"] });
export type TransferBody = z.infer<typeof TransferBody>;

export interface WalletView {
  id: string;
  name: string;
  type: WalletType;
  balance: number;
  /** Payment method this wallet receives by default at the Kasir. */
  defaultFor: "cash" | "transfer" | "qris" | null;
  archived: boolean;
}

export interface ExpenseView {
  id: string;
  amount: number;
  category: ExpenseCategory;
  categoryLabel: string;
  walletId: string;
  walletName: string;
  note: string | null;
  occurredAt: string;
  voided: boolean;
}

export interface CategorySuggestion {
  category: ExpenseCategory;
  /** "rule" = learned from this store's past choices; "keyword" = built-in dictionary. */
  source: "rule" | "keyword" | "default";
}

export interface MoneyMovement {
  entryId: string;
  occurredAt: string;
  description: string;
  sourceType: string;
  sourceId: string;
  walletId: string;
  walletName: string;
  /** Positive = uang masuk, negative = uang keluar. */
  amount: number;
}

/** Plain-language profit & loss (PRD §4); account-level detail only for Mode Lanjutan. */
export interface ProfitAndLoss {
  from: string;
  to: string;
  /** Penjualan kotor. */
  sales: number;
  discounts: number;
  /** Penjualan bersih = sales − discounts. */
  netSales: number;
  /** Modal barang terjual (HPP). */
  costOfGoods: number;
  channelCommission: number;
  expenses: number;
  expensesByCategory: Array<{ category: string; label: string; amount: number }>;
  otherIncome: number;
  /** Untung bersih = netSales − costOfGoods − channelCommission − expenses + otherIncome. */
  netProfit: number;
}
