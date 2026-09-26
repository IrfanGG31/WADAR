import { PaymentsPaymentReceivedV1 } from "@wadar/contracts";
import { emitEvent, type EventBus, type EventMeta, type Tx } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { findOrder, insertPayment, loadOrderParts } from "../infra/orders.repository.js";

export const SALES_CONSUMER = "sales";

/** payments.payment.received → mark the order paid (ARCHITECTURE §4.4: matching → order.paid). */
async function onPaymentReceived(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = PaymentsPaymentReceivedV1.parse(payload);
  if (!event.orderId) return;
  const order = await findOrder(tx, tenantId, event.orderId);
  if (!order) return;
  const parts = await loadOrderParts(tx, tenantId, order.id);
  const outstanding = order.net - parts.payments.reduce((s, p) => s + p.amount, 0);
  const applied = Math.min(event.amount, Math.max(outstanding, 0));
  if (applied <= 0) return;
  const inserted = await insertPayment(tx, {
    id: uuidv7(),
    tenantId,
    orderId: order.id,
    method: event.method,
    amount: applied,
    tendered: null,
    externalPaymentId: event.paymentId,
  });
  if (!inserted) return;
  await emitEvent(tx, {
    type: "sales.order.paid",
    tenantId,
    aggregateType: "order",
    aggregateId: order.id,
    correlationId: meta.eventId,
    causationId: meta.eventId,
    actor: { kind: "system", id: "sales" },
    payload: { orderId: order.id, paymentId: event.paymentId, amount: applied, method: event.method },
  });
}

export function registerSalesConsumers(eventBus: EventBus): void {
  eventBus.registerHandler("payments.payment.received", SALES_CONSUMER, onPaymentReceived);
}
