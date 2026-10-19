import { z } from "zod";

export const PAYMENT_METHODS = ["tunai", "qris", "transfer", "ewallet", "kartu", "lainnya", "marketplace"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  ewallet: "E-wallet",
  kartu: "Kartu",
  lainnya: "Lainnya",
  marketplace: "Lewat marketplace",
};

export const SaleInput = z.object({
  channel_id: z.string().uuid("Pilih kanal penjualan."),
  items: z
    .array(z.object({ variant_id: z.string().uuid(), qty: z.number().int().min(1).max(9_999) }))
    .min(1, "Keranjang masih kosong.")
    .max(100),
  order_discount: z.number().int().min(0).max(1_000_000_000_000).default(0),
  payment_method: z.enum(PAYMENT_METHODS),
  customer_phone: z.string().trim().max(30).optional().default(""),
  customer_name: z.string().trim().max(80).optional().default(""),
  /** Generated once per cart on the client; a retry or double tap reuses it (no duplicate sale). */
  idempotency_key: z.string().min(8).max(100),
  /** Device time of a sale queued offline (POS-6); the action decides whether to keep it. */
  occurred_at: z.string().max(40).optional(),
});
export type SaleInput = z.infer<typeof SaleInput>;
