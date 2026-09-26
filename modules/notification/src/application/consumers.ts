import { InventoryStockLowV1, PaymentsPaymentReceivedV1, SalesOrderCompletedV1, SalesOrderPaidV1, type RealtimePaymentReceived } from "@wadar/contracts";
import { moneyInSpeech } from "@wadar/core";
import type { EventBus, RealtimeBroker } from "@wadar/platform";

export const NOTIFICATION_CONSUMER = "notification";

/**
 * Turns domain events into realtime pushes (ARCHITECTURE §6.3). Runs in the
 * worker; the api instances fan these out to connected browsers. A retry
 * can push twice — clients dedupe by id.
 */
export function registerNotificationConsumers(eventBus: EventBus, realtime: RealtimeBroker): void {
  eventBus.registerHandler("payments.payment.received", NOTIFICATION_CONSUMER, async (_tx, payload, tenantId) => {
    const event = PaymentsPaymentReceivedV1.parse(payload);
    const message: RealtimePaymentReceived = {
      paymentId: event.paymentId,
      intentId: event.intentId,
      orderId: event.orderId,
      amount: event.amount,
      source: event.source,
      receivedAt: event.receivedAt,
      speech: moneyInSpeech(event.amount, event.source),
    };
    await realtime.publish(tenantId, "payment.received", message);
  });
  eventBus.registerHandler("sales.order.paid", NOTIFICATION_CONSUMER, async (_tx, payload, tenantId) => {
    const event = SalesOrderPaidV1.parse(payload);
    await realtime.publish(tenantId, "order.paid", { orderId: event.orderId, amount: event.amount });
  });
  eventBus.registerHandler("sales.order.completed", NOTIFICATION_CONSUMER, async (_tx, payload, tenantId) => {
    const event = SalesOrderCompletedV1.parse(payload);
    await realtime.publish(tenantId, "order.completed", { orderId: event.orderId, net: event.totals.net });
  });
  for (const type of ["inventory.stock.low", "inventory.stock.out"]) {
    eventBus.registerHandler(type, NOTIFICATION_CONSUMER, async (_tx, payload, tenantId) => {
      const event = InventoryStockLowV1.partial({ productName: true }).parse(payload);
      await realtime.publish(tenantId, "stock.alert", event);
    });
  }
  eventBus.registerHandler("finance.entry.posted", NOTIFICATION_CONSUMER, async (_tx, _payload, tenantId) => {
    await realtime.publish(tenantId, "ledger.updated", {});
  });
}
