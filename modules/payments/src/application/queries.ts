import type { IncomingPaymentView, PaymentIntentView } from "@wadar/contracts";
import { withTenantContext, type Db } from "@wadar/platform";
import { getOrderPaymentState } from "@wadar/sales";
import { and, desc, eq } from "drizzle-orm";
import { incomingPayments, paymentIntents } from "../db/schema.js";
import { toIntentView } from "./commands.js";

export async function getIntent(db: Db, tenantId: string, intentId: string): Promise<PaymentIntentView | undefined> {
  const [row] = await withTenantContext(db, tenantId, (tx) =>
    tx
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.tenantId, tenantId), eq(paymentIntents.id, intentId))),
  );
  return row ? toIntentView(row) : undefined;
}

/** Latest money in (Layar Kasir, PRD F1.5). */
export async function listIncomingPayments(db: Db, tenantId: string, limit: number): Promise<IncomingPaymentView[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(incomingPayments)
      .where(eq(incomingPayments.tenantId, tenantId))
      .orderBy(desc(incomingPayments.receivedAt))
      .limit(limit);
    const numbers = new Map<string, string>();
    for (const orderId of new Set(rows.map((r) => r.orderId).filter((id): id is string => id !== null))) {
      const state = await getOrderPaymentState(tx, tenantId, orderId);
      if (state) numbers.set(orderId, state.orderNumber);
    }
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      source: r.source,
      method: r.method,
      orderId: r.orderId,
      orderNumber: r.orderId ? (numbers.get(r.orderId) ?? null) : null,
      reference: r.reference,
      receivedAt: r.receivedAt.toISOString(),
    }));
  });
}
