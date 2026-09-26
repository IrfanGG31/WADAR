import type { StockMovementReason } from "@wadar/contracts";
import { emitEvent, type Tx } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { applyMovement } from "../domain/stock.js";
import { insertMovement, lockLevel, saveLevel } from "../infra/stock.repository.js";

export interface MovementSpec {
  outletId: string;
  variantId: string;
  delta: number;
  reason: StockMovementReason;
  unitCost?: number | null;
  revalueTo?: number | null;
  note?: string;
}

export interface MovementContext {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  actor: { kind: "user" | "system"; id: string };
  correlationId: string;
  causationId?: string;
}

export interface MovementResult {
  variantId: string;
  outletId: string;
  onHand: number;
  avgCost: number | null;
}

/**
 * The ONE write path for stock: every change appends a movement and
 * updates the projection in the caller's transaction, then emits
 * `inventory.stock.changed` (plus `inventory.stock.out` when a variant
 * crosses to ≤ 0). Locks are taken in a stable (variant, outlet) order so
 * two multi-line orders can't deadlock each other.
 */
export async function recordMovements(tx: Tx, ctx: MovementContext, specs: MovementSpec[]): Promise<MovementResult[]> {
  const ordered = [...specs].sort((a, b) =>
    a.variantId === b.variantId ? a.outletId.localeCompare(b.outletId) : a.variantId.localeCompare(b.variantId),
  );
  const results: MovementResult[] = [];
  for (const spec of ordered) {
    const level = await lockLevel(tx, ctx.tenantId, spec.outletId, spec.variantId);
    const next = applyMovement(
      { onHand: level.onHand, avgCost: level.avgCost },
      { delta: spec.delta, unitCost: spec.unitCost, revalueTo: spec.revalueTo },
    );
    await insertMovement(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      outletId: spec.outletId,
      variantId: spec.variantId,
      delta: spec.delta,
      reason: spec.reason,
      unitCost: spec.unitCost ?? spec.revalueTo ?? null,
      balanceAfter: next.onHand,
      avgCostAfter: next.avgCost,
      sourceType: ctx.sourceType,
      sourceId: ctx.sourceId,
      note: spec.note ?? null,
      createdBy: ctx.actor.id,
    });
    await saveLevel(tx, level.id, next.onHand, next.avgCost);

    if (spec.delta !== 0) {
      await emitEvent(tx, {
        type: "inventory.stock.changed",
        tenantId: ctx.tenantId,
        aggregateType: "variant",
        aggregateId: spec.variantId,
        correlationId: ctx.correlationId,
        causationId: ctx.causationId,
        actor: ctx.actor,
        payload: { variantId: spec.variantId, outletId: spec.outletId, delta: spec.delta, onHand: next.onHand, reason: spec.reason },
      });
      if (level.onHand > 0 && next.onHand <= 0) {
        await emitEvent(tx, {
          type: "inventory.stock.out",
          tenantId: ctx.tenantId,
          aggregateType: "variant",
          aggregateId: spec.variantId,
          correlationId: ctx.correlationId,
          causationId: ctx.causationId,
          actor: ctx.actor,
          payload: { variantId: spec.variantId, outletId: spec.outletId, onHand: next.onHand, daysLeft: null },
        });
      }
    }
    results.push({ variantId: spec.variantId, outletId: spec.outletId, onHand: next.onHand, avgCost: next.avgCost });
  }
  return results;
}
