import { z } from "zod";

export const CreateQrisIntentBody = z.object({ orderId: z.uuid() });
export type CreateQrisIntentBody = z.infer<typeof CreateQrisIntentBody>;

export type PaymentIntentStatus = "pending" | "paid" | "expired";

export interface PaymentIntentView {
  id: string;
  orderId: string | null;
  amount: number;
  status: PaymentIntentStatus;
  /** EMVCo QRIS payload — render it as a QR code. */
  qrString: string;
  expiresAt: string;
  paidAt: string | null;
  /** True when running without a real gateway (local/dev) — the UI may offer "simulate payment". */
  simulated: boolean;
}

export interface IncomingPaymentView {
  id: string;
  amount: number;
  source: string;
  method: "cash" | "transfer" | "qris" | "ewallet";
  orderId: string | null;
  orderNumber: string | null;
  reference: string | null;
  receivedAt: string;
}

/** Realtime message payloads pushed to the web app over SSE (ARCHITECTURE §6.3). */
export interface RealtimePaymentReceived {
  paymentId: string;
  intentId: string | null;
  orderId: string | null;
  amount: number;
  source: string;
  receivedAt: string;
  /** Pre-built TTS sentence ("Uang masuk … rupiah dari QRIS"). */
  speech: string;
}
