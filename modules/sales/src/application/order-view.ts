import type { OrderView, PaymentStatus } from "@wadar/contracts";
import type { Tx } from "@wadar/platform";
import { loadOrderParts, type OrderRow } from "../infra/orders.repository.js";
import { signReceiptToken } from "./receipt-token.js";

export function paymentStatus(net: number, paid: number): PaymentStatus {
  if (paid >= net) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

export async function buildOrderView(
  tx: Tx,
  order: OrderRow,
  options: { includeCost: boolean; receiptSecret: string },
): Promise<OrderView> {
  const parts = await loadOrderParts(tx, order.tenantId, order.id);
  const paid = parts.payments.reduce((sum, p) => sum + p.amount, 0);
  const cashPayment = parts.payments.find((p) => p.method === "cash" && p.tendered !== null);
  const view: OrderView = {
    id: order.id,
    orderNumber: order.orderNumber,
    outletId: order.outletId,
    channel: order.channel,
    status: parts.void ? "voided" : "completed",
    paymentStatus: paymentStatus(order.net, paid),
    gross: order.gross,
    discount: order.discount,
    net: order.net,
    paid,
    change: cashPayment ? cashPayment.tendered! - cashPayment.amount : 0,
    note: order.note,
    completedAt: order.completedAt.toISOString(),
    voidedAt: parts.void?.voidedAt.toISOString() ?? null,
    voidReason: parts.void?.reason ?? null,
    lines: parts.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discount,
      netAmount: l.netAmount,
      ...(options.includeCost ? { unitCost: l.unitCost } : {}),
    })),
    payments: parts.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      tendered: p.tendered,
      createdAt: p.createdAt.toISOString(),
    })),
    receiptToken: signReceiptToken(options.receiptSecret, order.tenantId, order.id),
  };
  if (options.includeCost) {
    view.cost = order.cost;
    view.commission = order.commission;
  }
  return view;
}
