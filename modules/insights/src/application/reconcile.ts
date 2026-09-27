import { addDays, localDateKey, localDayRange } from "@wadar/core";
import { profitAndLossTx, totalWalletBalanceTx } from "@wadar/finance";
import { listAllTenants } from "@wadar/identity";
import { withTenantContext, type Db, type ScheduledJobRegistry, type Tx } from "@wadar/platform";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { uuidv7 } from "uuidv7";
import { alerts, dailyCashflowAgg, reconciliationRuns, walletBalances } from "../db/schema.js";

export interface ReconciliationResult {
  day: string;
  ok: boolean;
  differences: Record<string, { aggregate: number; ledger: number }>;
}

/**
 * Nightly check that the dashboard's aggregates still equal the ledger
 * (ARCHITECTURE §5.4, BUILD-PLAN M6 DoD "angka kartu = hasil query
 * ledger"). A mismatch raises a critical feed alert instead of silently
 * showing wrong numbers.
 */
export async function reconcileDay(tx: Tx, tenantId: string, day: string, timezone: string): Promise<ReconciliationResult> {
  const { start } = localDayRange(day, timezone);
  const end = localDayRange(addDays(day, 1), timezone).start;
  const [ledger, [agg], ledgerBalance, [aggBalance]] = await Promise.all([
    profitAndLossTx(tx, tenantId, start, end),
    tx.select().from(dailyCashflowAgg).where(and(eq(dailyCashflowAgg.tenantId, tenantId), eq(dailyCashflowAgg.day, day))),
    totalWalletBalanceTx(tx, tenantId),
    tx.select({ total: sql<string>`coalesce(sum(${walletBalances.balance}), 0)` }).from(walletBalances).where(eq(walletBalances.tenantId, tenantId)),
  ]);
  const pairs: Record<string, [number, number]> = {
    sales: [agg?.sales ?? 0, ledger.sales],
    discounts: [agg?.discounts ?? 0, ledger.discounts],
    costOfGoods: [agg?.cogs ?? 0, ledger.costOfGoods],
    channelCommission: [agg?.commission ?? 0, ledger.channelCommission],
    expenses: [agg?.expenses ?? 0, ledger.expenses],
    otherIncome: [agg?.otherIncome ?? 0, ledger.otherIncome],
    walletTotal: [Number(aggBalance?.total ?? 0), ledgerBalance],
  };
  const differences: ReconciliationResult["differences"] = {};
  for (const [key, [aggregate, ledgerValue]] of Object.entries(pairs)) {
    if (aggregate !== ledgerValue) differences[key] = { aggregate, ledger: ledgerValue };
  }
  return { day, ok: Object.keys(differences).length === 0, differences };
}

export async function reconcileTenant(db: Db, tenantId: string, timezone: string, now = new Date()): Promise<ReconciliationResult[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const today = localDateKey(now, timezone);
    const results = [await reconcileDay(tx, tenantId, addDays(today, -1), timezone), await reconcileDay(tx, tenantId, today, timezone)];
    for (const result of results) {
      await tx.insert(reconciliationRuns).values({ id: uuidv7(), tenantId, day: result.day, ok: result.ok, details: result.differences });
      if (!result.ok) {
        await tx
          .insert(alerts)
          .values({
            id: uuidv7(),
            tenantId,
            type: "reconciliation",
            dedupeKey: `reconciliation:${result.day}`,
            severity: "critical",
            title: "Ada angka keuangan yang tidak cocok",
            body: `Ringkasan tanggal ${result.day} berbeda dengan pembukuan. Tim kami akan mengecek; angka di Keuangan › Masuk/Keluar tetap yang benar.`,
            data: result.differences,
          })
          .onConflictDoNothing();
      }
    }
    if (results.every((r) => r.ok)) {
      await tx
        .update(alerts)
        .set({ resolvedAt: new Date() })
        .where(and(eq(alerts.tenantId, tenantId), eq(alerts.type, "reconciliation"), isNull(alerts.resolvedAt)));
    }
    return results;
  });
}

export function registerInsightsJobs(scheduler: ScheduledJobRegistry): void {
  scheduler.register({
    name: "insights-reconcile",
    everyMs: 6 * 60 * 60 * 1000,
    run: async (db: Db, logger: Logger) => {
      for (const tenant of await listAllTenants(db)) {
        const results = await reconcileTenant(db, tenant.id, tenant.timezone);
        const bad = results.filter((r) => !r.ok);
        if (bad.length > 0) logger.error({ tenantId: tenant.id, bad }, "insights reconciliation mismatch");
      }
    },
  });
}
