import { z } from "zod";
import { Rupiah } from "@wadar/contracts/common";

export const StockMovementReason = z.enum([
  "opening",
  "sale",
  "void",
  "adjustment",
  "purchase",
  "return",
  "transfer_in",
  "transfer_out",
]);
export type StockMovementReason = z.infer<typeof StockMovementReason>;

export const STOCK_REASON_LABEL: Record<StockMovementReason, string> = {
  opening: "Stok awal",
  sale: "Terjual",
  void: "Batal jual",
  adjustment: "Penyesuaian",
  purchase: "Barang masuk",
  return: "Retur",
  transfer_in: "Pindahan masuk",
  transfer_out: "Pindahan keluar",
};

export const StockStatus = z.enum(["aman", "menipis", "kritis"]);
export type StockStatus = z.infer<typeof StockStatus>;

export const AdjustStockBody = z.discriminatedUnion("mode", [
  /** Stock opname: "the shelf actually has N". */
  z.object({
    mode: z.literal("set"),
    outletId: z.uuid(),
    variantId: z.uuid(),
    quantity: z.number().int().min(-1_000_000).max(1_000_000),
    note: z.string().trim().max(300).optional(),
  }),
  /** Goods received (with purchase cost → moving-average HPP). */
  z.object({
    mode: z.literal("receive"),
    outletId: z.uuid(),
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(1_000_000),
    unitCost: Rupiah.optional(),
    note: z.string().trim().max(300).optional(),
  }),
]);
export type AdjustStockBody = z.infer<typeof AdjustStockBody>;

export interface StockMovementView {
  id: string;
  variantId: string;
  delta: number;
  reason: StockMovementReason;
  balanceAfter: number;
  unitCost?: number | null;
  note: string | null;
  createdAt: string;
}

export interface StockItemView {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  category: string | null;
  photoUrl: string | null;
  onHand: number;
  avgCost?: number;
  status: StockStatus;
  /** Estimated days until empty at the recent sales rate; null = not enough sales history. */
  daysLeft: number | null;
  missing: Array<"cost" | "photo" | "price">;
}
