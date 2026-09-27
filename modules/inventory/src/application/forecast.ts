import { getVariantsForSale } from "@wadar/catalog";
import { InventoryStockChangedV1 } from "@wadar/contracts";
import { addDays, localDateKey, localDayRange } from "@wadar/core";
import { getTenantTimezone, listAllTenants } from "@wadar/identity";
import { emitEvent, withTenantContext, type Db, type EventBus, type EventMeta, type ScheduledJobRegistry, type Tx } from "@wadar/platform";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { FORECAST_HISTORY_DAYS, forecastStock, shouldAlertLow } from "../domain/forecast.js";
import { forecasts, stockLevels, stockMovements } from "../db/schema.js";

export const FORECAST_CONSUMER = "inventory-forecast";

/**
 * Recomputes the forecast for some variants at one outlet from the last
 * 28 local days of sale/void movements, and emits `inventory.stock.low`
 * when cover drops under 7 days (deduped to once per 24 h).
 */
export async function recomputeForecasts(
  tx: Tx,
  tenantId: string,
  outletId: string,
  variantIds: string[],
  now = new Date(),
): Promise<void> {
  if (variantIds.length === 0) return;
  const timezone = await getTenantTimezone(tx, tenantId);
  const today = localDateKey(now, timezone);
  const firstDay = addDays(today, -(FORECAST_HISTORY_DAYS - 1));
  const since = localDayRange(firstDay, timezone).start;

  const [movements, levels, existing] = await Promise.all([
    tx
      .select({ variantId: stockMovements.variantId, delta: stockMovements.delta, createdAt: stockMovements.createdAt })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.outletId, outletId),
          inArray(stockMovements.variantId, variantIds),
          inArray(stockMovements.reason, ["sale", "void"]),
          gte(stockMovements.createdAt, since),
        ),
      ),
    tx
      .select()
      .from(stockLevels)
      .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.outletId, outletId), inArray(stockLevels.variantId, variantIds))),
    tx
      .select()
      .from(forecasts)
      .where(and(eq(forecasts.tenantId, tenantId), eq(forecasts.outletId, outletId), inArray(forecasts.variantId, variantIds))),
  ]);

  const dayIndex = new Map<string, number>();
  for (let i = 0; i < FORECAST_HISTORY_DAYS; i++) dayIndex.set(addDays(firstDay, i), i);
  const soldByVariant = new Map<string, number[]>();
  for (const m of movements) {
    const index = dayIndex.get(localDateKey(m.createdAt, timezone));
    if (index === undefined) continue;
    const series = soldByVariant.get(m.variantId) ?? new Array<number>(FORECAST_HISTORY_DAYS).fill(0);
    series[index]! -= m.delta; // sale = negative delta; void adds back
    soldByVariant.set(m.variantId, series);
  }
  const levelByVariant = new Map(levels.map((l) => [l.variantId, l]));
  const existingByVariant = new Map(existing.map((f) => [f.variantId, f]));
  const toAlert: Array<{ variantId: string; onHand: number; daysLeft: number }> = [];

  for (const variantId of variantIds) {
    const onHand = levelByVariant.get(variantId)?.onHand ?? 0;
    const result = forecastStock(soldByVariant.get(variantId)?.map((q) => Math.max(q, 0)) ?? new Array(FORECAST_HISTORY_DAYS).fill(0), onHand);
    const previous = existingByVariant.get(variantId);
    const alert = shouldAlertLow(result, previous?.lowAlertedAt ?? null, now);
    await tx
      .insert(forecasts)
      .values({
        id: uuidv7(),
        tenantId,
        outletId,
        variantId,
        dailyRateMilli: Math.round(result.dailyRate * 1000),
        daysLeft: result.daysLeft,
        reorderQty: result.reorderQty,
        lowAlertedAt: alert ? now : (previous?.lowAlertedAt ?? null),
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: [forecasts.tenantId, forecasts.outletId, forecasts.variantId],
        set: {
          dailyRateMilli: Math.round(result.dailyRate * 1000),
          daysLeft: result.daysLeft,
          reorderQty: result.reorderQty,
          lowAlertedAt: alert ? now : sql`${forecasts.lowAlertedAt}`,
          computedAt: now,
        },
      });
    if (alert) toAlert.push({ variantId, onHand, daysLeft: result.daysLeft! });
  }

  if (toAlert.length === 0) return;
  const names = new Map(
    (await getVariantsForSale(tx, tenantId, toAlert.map((a) => a.variantId))).map((v) => [
      v.variantId,
      v.variantName ? `${v.productName} (${v.variantName})` : v.productName,
    ]),
  );
  for (const alert of toAlert) {
    await emitEvent(tx, {
      type: "inventory.stock.low",
      tenantId,
      aggregateType: "variant",
      aggregateId: alert.variantId,
      correlationId: `forecast:${alert.variantId}:${today}`,
      actor: { kind: "system", id: "inventory-forecast" },
      payload: { variantId: alert.variantId, outletId, productName: names.get(alert.variantId) ?? "", onHand: alert.onHand, daysLeft: alert.daysLeft },
    });
  }
}

async function onStockChanged(tx: Tx, payload: unknown, tenantId: string, _meta: EventMeta): Promise<void> {
  const event = InventoryStockChangedV1.parse(payload);
  await recomputeForecasts(tx, tenantId, event.outletId, [event.variantId]);
}

export function registerForecastConsumer(eventBus: EventBus): void {
  eventBus.registerHandler("inventory.stock.changed", FORECAST_CONSUMER, onStockChanged);
}

/** Rolling window moves every day even without sales — refresh everything periodically. */
export async function refreshAllForecasts(db: Db): Promise<void> {
  for (const tenant of await listAllTenants(db)) {
    await withTenantContext(db, tenant.id, async (tx) => {
      const levels = await tx.select({ outletId: stockLevels.outletId, variantId: stockLevels.variantId }).from(stockLevels).where(eq(stockLevels.tenantId, tenant.id));
      const byOutlet = new Map<string, string[]>();
      for (const level of levels) byOutlet.set(level.outletId, [...(byOutlet.get(level.outletId) ?? []), level.variantId]);
      for (const [outletId, variantIds] of byOutlet) await recomputeForecasts(tx, tenant.id, outletId, variantIds);
    });
  }
}

export function registerInventoryJobs(scheduler: ScheduledJobRegistry): void {
  scheduler.register({ name: "inventory-forecast", everyMs: 6 * 60 * 60 * 1000, run: (db) => refreshAllForecasts(db) });
}

export interface StockAlertItem {
  variantId: string;
  productId: string;
  name: string;
  onHand: number;
  daysLeft: number | null;
  reorderQty: number;
}

/** Port for the Beranda feed (BUILD-PLAN M6 DoD: "Produk dengan stok < 7 hari muncul di peringatan dengan estimasi hari"). */
export async function listStockAlerts(tx: Tx, tenantId: string, outletId: string): Promise<StockAlertItem[]> {
  const rows = await tx
    .select({ variantId: stockLevels.variantId, onHand: stockLevels.onHand, daysLeft: forecasts.daysLeft, reorderQty: forecasts.reorderQty })
    .from(stockLevels)
    .leftJoin(
      forecasts,
      and(eq(forecasts.tenantId, stockLevels.tenantId), eq(forecasts.outletId, stockLevels.outletId), eq(forecasts.variantId, stockLevels.variantId)),
    )
    .where(
      and(
        eq(stockLevels.tenantId, tenantId),
        eq(stockLevels.outletId, outletId),
        sql`(${stockLevels.onHand} <= 0 or ${forecasts.daysLeft} < 7)`,
      ),
    );
  if (rows.length === 0) return [];
  const variants = new Map((await getVariantsForSale(tx, tenantId, rows.map((r) => r.variantId))).map((v) => [v.variantId, v]));
  return rows
    .filter((r) => variants.get(r.variantId) && !variants.get(r.variantId)!.archived)
    .map((r) => {
      const v = variants.get(r.variantId)!;
      return {
        variantId: r.variantId,
        productId: v.productId,
        name: v.variantName ? `${v.productName} (${v.variantName})` : v.productName,
        onHand: r.onHand,
        daysLeft: r.onHand <= 0 ? 0 : r.daysLeft,
        reorderQty: r.reorderQty ?? 0,
      };
    })
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
}
