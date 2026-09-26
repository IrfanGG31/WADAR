import { PaymentsPaymentReceivedV1, SalesOrderCompletedV1, SalesOrderVoidedV1 } from "@wadar/contracts";
import type { EventBus, EventMeta, Tx } from "@wadar/platform";
import { postOrderCompleted, postPaymentReceived, reverse } from "../domain/posting.js";
import { activeWallets, ensureLedger, findEntryBySource, type Ledger } from "../infra/ledger.repository.js";
import { postAndEmit } from "./post.js";

export const FINANCE_CONSUMER = "finance";

function walletAccountFor(ledger: Ledger, method: string, walletId: string | null): string {
  if (walletId) {
    const chosen = ledger.wallets.find((w) => w.id === walletId);
    if (chosen) return chosen.accountId;
  }
  const defaultFor = method === "cash" ? "cash" : method === "qris" || method === "ewallet" ? "qris" : "transfer";
  const wallet = ledger.wallets.find((w) => w.defaultFor === defaultFor) ?? activeWallets(ledger)[0]!;
  return wallet.accountId;
}

async function onTenantCreated(tx: Tx, _payload: unknown, tenantId: string): Promise<void> {
  await ensureLedger(tx, tenantId);
}

async function onOrderCompleted(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = SalesOrderCompletedV1.parse(payload);
  const ledger = await ensureLedger(tx, tenantId);
  const entry = postOrderCompleted(ledger.accounts, {
    orderNumber: event.orderNumber,
    gross: event.totals.gross,
    discount: event.totals.discount,
    cost: event.totals.cost,
    commission: event.totals.commission,
    outstanding: event.outstanding,
    payments: event.payments.map((p) => ({ walletAccountId: walletAccountFor(ledger, p.method, p.walletId), amount: p.amount })),
  });
  await postAndEmit(tx, entry, {
    tenantId,
    ledger,
    occurredAt: new Date(event.completedAt),
    sourceType: "order",
    sourceId: event.orderId,
    createdBy: "system:finance",
    correlationId: meta.eventId,
    causationId: meta.eventId,
  });
}

async function onOrderVoided(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = SalesOrderVoidedV1.parse(payload);
  const ledger = await ensureLedger(tx, tenantId);
  const original = await findEntryBySource(tx, tenantId, "order", event.orderId);
  // Posting follows the event order; if the sale was never posted there's nothing to reverse.
  if (!original) throw new Error(`order ${event.orderId} voided before its sale was posted — retry`);
  await postAndEmit(tx, reverse(original.lines, `Batal penjualan #${event.orderNumber}`), {
    tenantId,
    ledger,
    occurredAt: new Date(event.voidedAt),
    sourceType: "order_void",
    sourceId: event.orderId,
    createdBy: "system:finance",
    correlationId: meta.eventId,
    causationId: meta.eventId,
    reversalOf: { entryId: original.entry.id, occurredAt: original.entry.occurredAt },
  });
}

async function onPaymentReceived(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = PaymentsPaymentReceivedV1.parse(payload);
  const ledger = await ensureLedger(tx, tenantId);
  const entry = postPaymentReceived(ledger.accounts, {
    walletAccountId: walletAccountFor(ledger, event.method, null),
    amount: event.amount,
    appliedToOrder: event.orderId ? event.amount : 0,
    description: `Uang masuk ${event.source}${event.reference ? ` (${event.reference})` : ""}`,
  });
  await postAndEmit(tx, entry, {
    tenantId,
    ledger,
    occurredAt: new Date(event.receivedAt),
    sourceType: "payment",
    sourceId: event.paymentId,
    createdBy: "system:finance",
    correlationId: meta.eventId,
    causationId: meta.eventId,
  });
}

export function registerFinanceConsumers(eventBus: EventBus): void {
  eventBus.registerHandler("identity.tenant.created", FINANCE_CONSUMER, onTenantCreated);
  eventBus.registerHandler("sales.order.completed", FINANCE_CONSUMER, onOrderCompleted);
  eventBus.registerHandler("sales.order.voided", FINANCE_CONSUMER, onOrderVoided);
  eventBus.registerHandler("payments.payment.received", FINANCE_CONSUMER, onPaymentReceived);
}
