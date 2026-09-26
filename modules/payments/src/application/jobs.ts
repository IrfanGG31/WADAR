import { listAllTenants } from "@wadar/identity";
import { emitEvent, withTenantContext, type Db, type ScheduledJobRegistry } from "@wadar/platform";
import { and, eq, lt } from "drizzle-orm";
import type { Logger } from "pino";
import { paymentIntents } from "../db/schema.js";
import type { PaymentProvider } from "../infra/provider.js";
import { recordProviderPayment } from "./commands.js";

/**
 * ARCHITECTURE §8 "Xendit webhook … job rekonsiliasi tiap 15 menit menarik
 * status intent yang masih pending": catches payments whose webhook never
 * arrived, and expires QRs nobody paid.
 */
export async function reconcilePendingIntents(db: Db, provider: PaymentProvider, logger: Logger): Promise<void> {
  const tenants = await listAllTenants(db);
  for (const tenant of tenants) {
    const pending = await withTenantContext(db, tenant.id, (tx) =>
      tx
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.tenantId, tenant.id), eq(paymentIntents.status, "pending"), lt(paymentIntents.createdAt, new Date(Date.now() - 60_000)))),
    );
    for (const intent of pending) {
      if (intent.provider === provider.name && provider.name !== "simulator") {
        try {
          for (const payment of await provider.listQrPayments(intent.providerRef)) {
            await recordProviderPayment(db, provider.name, payment, { reconciled: true, ...payment });
          }
        } catch (error) {
          logger.warn({ err: error, intentId: intent.id }, "reconcile: provider lookup failed, will retry next run");
          continue;
        }
      }
      if (intent.expiresAt.getTime() < Date.now()) {
        await withTenantContext(db, tenant.id, async (tx) => {
          const expired = await tx
            .update(paymentIntents)
            .set({ status: "expired" })
            .where(and(eq(paymentIntents.id, intent.id), eq(paymentIntents.status, "pending")))
            .returning({ id: paymentIntents.id });
          if (expired.length === 0) return;
          await emitEvent(tx, {
            type: "payments.payment.expired",
            tenantId: tenant.id,
            aggregateType: "payment_intent",
            aggregateId: intent.id,
            correlationId: intent.id,
            actor: { kind: "system", id: "payments-reconcile" },
            payload: { intentId: intent.id, orderId: intent.orderId, amount: intent.amount },
          });
        });
      }
    }
  }
}

export function registerPaymentsJobs(scheduler: ScheduledJobRegistry, provider: PaymentProvider): void {
  scheduler.register({
    name: "payments-reconcile",
    everyMs: 15 * 60 * 1000,
    run: (db, logger) => reconcilePendingIntents(db, provider, logger),
  });
}
