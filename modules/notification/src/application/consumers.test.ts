import { EventBus, type RealtimeBroker, type Tx } from "@wadar/platform";
import { describe, expect, it, vi } from "vitest";
import { NOTIFICATION_CONSUMER, registerNotificationConsumers } from "./consumers.js";

describe("notification consumers", () => {
  it("turns payments.payment.received into a realtime push with the spoken sentence", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const bus = new EventBus();
    registerNotificationConsumers(bus, { publish } as unknown as RealtimeBroker);
    const handler = bus.handlerFor("payments.payment.received", NOTIFICATION_CONSUMER)!;
    await handler(
      {} as Tx,
      {
        paymentId: "01a0df3a-a5e0-7d27-bd7e-0416d06123c3",
        intentId: null,
        orderId: null,
        amount: 50_000,
        source: "GoPay",
        method: "qris",
        reference: null,
        receivedAt: "2026-09-26T10:00:00.000Z",
      },
      "01a0df3a-a5e0-7d27-bd7e-0416d06123c4",
      { eventId: "e", eventType: "payments.payment.received" },
    );
    expect(publish).toHaveBeenCalledWith(
      "01a0df3a-a5e0-7d27-bd7e-0416d06123c4",
      "payment.received",
      expect.objectContaining({ amount: 50_000, speech: "Uang masuk lima puluh ribu rupiah dari GoPay" }),
    );
  });

  it("subscribes to order, stock and ledger events too", () => {
    const bus = new EventBus();
    registerNotificationConsumers(bus, { publish: vi.fn() } as unknown as RealtimeBroker);
    for (const type of ["sales.order.paid", "sales.order.completed", "inventory.stock.low", "inventory.stock.out", "finance.entry.posted"]) {
      expect(bus.consumersFor(type)).toContain(NOTIFICATION_CONSUMER);
    }
  });
});
