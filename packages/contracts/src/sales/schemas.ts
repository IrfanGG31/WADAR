import { z } from "zod";
import { Rupiah, SalesChannel } from "@wadar/contracts/common";

export const CheckoutPayment = z.discriminatedUnion("method", [
  /** Tunai — `tendered` is what the customer handed over; change = tendered − total. */
  z.object({ method: z.literal("cash"), tendered: Rupiah }),
  /** Transfer bank manual, already confirmed by the cashier. */
  z.object({ method: z.literal("transfer"), walletId: z.uuid().optional() }),
  /** QRIS dinamis — order completes unpaid; payment arrives via the payments webhook (M5). */
  z.object({ method: z.literal("qris") }),
]);
export type CheckoutPayment = z.infer<typeof CheckoutPayment>;

export const CompleteOrderBody = z.object({
  outletId: z.uuid(),
  channel: SalesChannel.default("pos"),
  lines: z
    .array(
      z.object({
        variantId: z.uuid(),
        qty: z.number().int().min(1).max(100_000),
        /** Per-line discount in rupiah (total for the line, not per unit). */
        discount: Rupiah.default(0),
      }),
    )
    .min(1, "Keranjang masih kosong")
    .max(200),
  /** Whole-order discount in rupiah. */
  discount: Rupiah.default(0),
  payment: CheckoutPayment,
  note: z.string().trim().max(500).optional(),
});
export type CompleteOrderBody = z.infer<typeof CompleteOrderBody>;

export const VoidOrderBody = z.object({
  reason: z.string().trim().min(3, "Tulis alasan pembatalan").max(300),
});
export type VoidOrderBody = z.infer<typeof VoidOrderBody>;

export const SetChannelCommissionBody = z.object({
  channel: SalesChannel,
  /** Basis points: 250 = 2,5%. */
  commissionBps: z.number().int().min(0).max(5000),
});
export type SetChannelCommissionBody = z.infer<typeof SetChannelCommissionBody>;

export type PaymentStatus = "paid" | "unpaid" | "partial";

export interface OrderLineView {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  netAmount: number;
  unitCost?: number;
}

export interface OrderPaymentView {
  id: string;
  method: "cash" | "transfer" | "qris" | "ewallet";
  amount: number;
  tendered: number | null;
  createdAt: string;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  outletId: string;
  channel: SalesChannel;
  status: "completed" | "voided";
  paymentStatus: PaymentStatus;
  gross: number;
  discount: number;
  net: number;
  /** Omitted for roles without finance/catalog access. */
  cost?: number;
  commission?: number;
  paid: number;
  change: number;
  note: string | null;
  completedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  lines: OrderLineView[];
  payments: OrderPaymentView[];
  /** For the public receipt link: /struk/{receiptToken}. */
  receiptToken: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  channel: SalesChannel;
  status: "completed" | "voided";
  paymentStatus: PaymentStatus;
  net: number;
  itemCount: number;
  completedAt: string;
}

export interface OrderListPage {
  items: OrderListItem[];
  nextCursor: string | null;
}

export interface PublicReceipt {
  storeName: string;
  outletName: string;
  outletAddress: string | null;
  orderNumber: string;
  completedAt: string;
  timezone: string;
  status: "completed" | "voided";
  lines: Array<{ name: string; qty: number; unitPrice: number; discount: number; netAmount: number }>;
  gross: number;
  discount: number;
  net: number;
  paid: number;
  change: number;
  paymentMethod: string | null;
}
