import type { PaymentIntentView } from "@wadar/contracts";
import { emitEvent, withTenantContext, type Db, type Tx } from "@wadar/platform";
import { getOrderPaymentState } from "@wadar/sales";
import { and, eq, gt } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { incomingPayments, paymentIntents, providerEvents } from "../db/schema.js";
import { buildReferenceId, parseReferenceId, type PaymentProvider, type ProviderPayment } from "../infra/provider.js";

const INTENT_TTL_MS = 15 * 60 * 1000;

export class PaymentsError extends Error {
  constructor(
    readonly code: "ORDER_NOT_FOUND" | "ORDER_ALREADY_PAID" | "ORDER_VOIDED" | "INTENT_NOT_FOUND" | "PROVIDER_UNAVAILABLE",
    message: string,
    readonly status: 404 | 422 | 502 = 422,
  ) {
    super(message);
  }
}

export function toIntentView(row: typeof paymentIntents.$inferSelect): PaymentIntentView {
  return {
    id: row.id,
    orderId: row.orderId,
    amount: row.amount,
    status: row.status,
    qrString: row.qrString,
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    simulated: row.provider === "simulator",
  };
}

/**
 * Dynamic QRIS for what's still owed on an order (PRD F1.1, O2.2). Reuses a
 * still-valid pending intent so a cashier re-opening the QR doesn't create
 * a second one. The gateway call happens OUTSIDE any DB transaction (it can
 * take seconds — ARCHITECTURE §8: 8 s timeout).
 */
export async function createQrisIntent(
  db: Db,
  provider: PaymentProvider,
  ctx: { tenantId: string; actorUserId: string },
  orderId: string,
): Promise<PaymentIntentView> {
  const state = await withTenantContext(db, ctx.tenantId, async (tx) => {
    const order = await getOrderPaymentState(tx, ctx.tenantId, orderId);
    if (!order) throw new PaymentsError("ORDER_NOT_FOUND", "Pesanan tidak ditemukan.", 404);
    if (order.voided) throw new PaymentsError("ORDER_VOIDED", "Pesanan ini sudah dibatalkan.");
    if (order.outstanding <= 0) throw new PaymentsError("ORDER_ALREADY_PAID", "Pesanan ini sudah lunas.");
    const [reusable] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, ctx.tenantId),
          eq(paymentIntents.orderId, orderId),
          eq(paymentIntents.status, "pending"),
          eq(paymentIntents.amount, order.outstanding),
          gt(paymentIntents.expiresAt, new Date(Date.now() + 60_000)),
        ),
      );
    return { order, reusable };
  });
  if (state.reusable) return toIntentView(state.reusable);

  const intentId = uuidv7();
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
  const referenceId = buildReferenceId(ctx.tenantId, intentId);
  let created;
  try {
    created = await provider.createQris({ referenceId, amount: state.order.outstanding, expiresAt });
  } catch {
    throw new PaymentsError("PROVIDER_UNAVAILABLE", "QRIS sedang tidak tersedia. Pakai tunai atau transfer dulu.", 502);
  }
  const [row] = await withTenantContext(db, ctx.tenantId, (tx) =>
    tx
      .insert(paymentIntents)
      .values({
        id: intentId,
        tenantId: ctx.tenantId,
        orderId,
        amount: state.order.outstanding,
        provider: provider.name,
        providerRef: created.providerRef,
        qrString: created.qrString,
        expiresAt,
        createdBy: ctx.actorUserId,
      })
      .returning(),
  );
  return toIntentView(row!);
}

export type RecordResult = "recorded" | "duplicate" | "unknown_intent" | "already_paid";

/**
 * The single path for "money arrived" (webhook, simulator, reconciliation):
 * dedupe on the provider's event id, append the incoming payment, mark the
 * intent paid, emit `payments.payment.received` — one transaction.
 */
export async function recordProviderPayment(
  db: Db,
  providerName: string,
  payment: ProviderPayment,
  rawPayload: unknown,
): Promise<RecordResult> {
  const ref = parseReferenceId(payment.referenceId);
  if (!ref) return "unknown_intent";
  return withTenantContext(db, ref.tenantId, async (tx) => {
    const fresh = await tx
      .insert(providerEvents)
      .values({ id: uuidv7(), tenantId: ref.tenantId, provider: providerName, providerEventId: payment.providerEventId, payload: rawPayload as object })
      .onConflictDoNothing()
      .returning({ id: providerEvents.id });
    if (fresh.length === 0) return "duplicate";
    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.tenantId, ref.tenantId), eq(paymentIntents.id, ref.intentId)));
    if (!intent) return "unknown_intent";
    if (intent.status === "paid") return "already_paid";
    return applyPayment(tx, intent, payment, fresh[0]!.id);
  });
}

async function applyPayment(
  tx: Tx,
  intent: typeof paymentIntents.$inferSelect,
  payment: ProviderPayment,
  providerEventRowId: string,
): Promise<RecordResult> {
  const paymentId = uuidv7();
  const inserted = await tx
    .insert(incomingPayments)
    .values({
      id: paymentId,
      tenantId: intent.tenantId,
      intentId: intent.id,
      orderId: intent.orderId,
      amount: payment.amount,
      method: "qris",
      source: payment.source,
      reference: payment.providerEventId,
      providerEventId: providerEventRowId,
      receivedAt: payment.paidAt,
    })
    .onConflictDoNothing()
    .returning({ id: incomingPayments.id });
  if (inserted.length === 0) return "already_paid";
  await tx
    .update(paymentIntents)
    .set({ status: "paid", paidAt: payment.paidAt })
    .where(eq(paymentIntents.id, intent.id));
  await emitEvent(tx, {
    type: "payments.payment.received",
    tenantId: intent.tenantId,
    aggregateType: "payment",
    aggregateId: paymentId,
    correlationId: payment.providerEventId,
    actor: { kind: "webhook", id: "payments" },
    payload: {
      paymentId,
      intentId: intent.id,
      orderId: intent.orderId,
      amount: payment.amount,
      source: payment.source,
      method: "qris",
      reference: payment.providerEventId,
      receivedAt: payment.paidAt.toISOString(),
    },
  });
  return "recorded";
}

/** Simulator only: pretend the customer scanned and paid, through the real processing path. */
export async function simulateIntentPaid(db: Db, tenantId: string, intentId: string): Promise<RecordResult> {
  const intent = await withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.tenantId, tenantId), eq(paymentIntents.id, intentId)));
    return row;
  });
  if (!intent || intent.provider !== "simulator") throw new PaymentsError("INTENT_NOT_FOUND", "QRIS tidak ditemukan.", 404);
  const payment: ProviderPayment = {
    providerEventId: `sim_pay_${intent.id}`,
    referenceId: buildReferenceId(tenantId, intent.id),
    amount: intent.amount,
    source: "QRIS",
    paidAt: new Date(),
  };
  return recordProviderPayment(db, "simulator", payment, { simulated: true, ...payment });
}
