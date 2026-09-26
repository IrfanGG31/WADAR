import type { Tx } from "@wadar/platform";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { forecasts, stockLevels, stockMovements } from "../db/schema.js";

export type StockLevelRow = typeof stockLevels.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
export type ForecastRow = typeof forecasts.$inferSelect;

/**
 * Locks (creating if needed) the projection row for one variant@outlet.
 * `FOR UPDATE` serializes concurrent movements on the same variant so the
 * read-modify-write of on_hand/avg_cost can't lose an update.
 */
export async function lockLevel(tx: Tx, tenantId: string, outletId: string, variantId: string): Promise<StockLevelRow> {
  await tx
    .insert(stockLevels)
    .values({ id: uuidv7(), tenantId, outletId, variantId, onHand: 0, avgCost: null })
    .onConflictDoNothing({ target: [stockLevels.tenantId, stockLevels.outletId, stockLevels.variantId] });
  const [row] = await tx
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.outletId, outletId), eq(stockLevels.variantId, variantId)))
    .for("update");
  return row!;
}

export async function saveLevel(tx: Tx, id: string, onHand: number, avgCost: number | null): Promise<void> {
  await tx.update(stockLevels).set({ onHand, avgCost, updatedAt: new Date() }).where(eq(stockLevels.id, id));
}

export async function insertMovement(tx: Tx, row: typeof stockMovements.$inferInsert): Promise<void> {
  await tx.insert(stockMovements).values(row);
}

export async function levelsForOutlet(tx: Tx, tenantId: string, outletId: string): Promise<StockLevelRow[]> {
  return tx.select().from(stockLevels).where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.outletId, outletId)));
}

export async function levelsForVariants(tx: Tx, tenantId: string, outletId: string, variantIds: string[]): Promise<StockLevelRow[]> {
  if (variantIds.length === 0) return [];
  return tx
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.outletId, outletId), inArray(stockLevels.variantId, variantIds)));
}

export async function levelsForVariantAllOutlets(tx: Tx, tenantId: string, variantId: string): Promise<StockLevelRow[]> {
  return tx.select().from(stockLevels).where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.variantId, variantId)));
}

export async function recentMovements(
  tx: Tx,
  tenantId: string,
  variantId: string,
  outletId: string | undefined,
  limit: number,
): Promise<StockMovementRow[]> {
  const conditions = [eq(stockMovements.tenantId, tenantId), eq(stockMovements.variantId, variantId)];
  if (outletId) conditions.push(eq(stockMovements.outletId, outletId));
  return tx
    .select()
    .from(stockMovements)
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit);
}

export async function forecastsForOutlet(tx: Tx, tenantId: string, outletId: string): Promise<ForecastRow[]> {
  return tx.select().from(forecasts).where(and(eq(forecasts.tenantId, tenantId), eq(forecasts.outletId, outletId)));
}

/** Σ delta per variant for an outlet — used by tests to prove the projection invariant. */
export async function movementSums(tx: Tx, tenantId: string, outletId: string): Promise<Map<string, number>> {
  const rows = await tx
    .select({ variantId: stockMovements.variantId, total: sql<string>`sum(${stockMovements.delta})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.tenantId, tenantId), eq(stockMovements.outletId, outletId)))
    .groupBy(stockMovements.variantId);
  return new Map(rows.map((r) => [r.variantId, Number(r.total)]));
}
