import { getVariantsForSale } from "@wadar/catalog";
import type { AdjustStockBody } from "@wadar/contracts";
import { outletBelongsToTenant } from "@wadar/identity";
import { insertAuditLog, withTenantContext, type Db } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { lockLevel } from "../infra/stock.repository.js";
import { recordMovements, type MovementResult } from "./record-movements.js";

export class InventoryError extends Error {
  constructor(
    readonly code: "OUTLET_NOT_FOUND" | "VARIANT_NOT_FOUND" | "NO_CHANGE",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Manual stock change (PRD O4.1): "set" = stock opname (the shelf really
 * has N → record the difference), "receive" = goods in with an optional
 * purchase cost that feeds the moving-average HPP.
 */
export async function adjustStock(
  db: Db,
  ctx: { tenantId: string; actorUserId: string; correlationId: string },
  body: AdjustStockBody,
): Promise<MovementResult> {
  return withTenantContext(db, ctx.tenantId, async (tx) => {
    if (!(await outletBelongsToTenant(tx, ctx.tenantId, body.outletId))) {
      throw new InventoryError("OUTLET_NOT_FOUND", "Outlet tidak ditemukan.");
    }
    const [variant] = await getVariantsForSale(tx, ctx.tenantId, [body.variantId]);
    if (!variant) {
      throw new InventoryError("VARIANT_NOT_FOUND", "Produk tidak ditemukan.");
    }
    const adjustmentId = uuidv7();
    let delta: number;
    let unitCost: number | null = null;
    if (body.mode === "set") {
      const level = await lockLevel(tx, ctx.tenantId, body.outletId, body.variantId);
      delta = body.quantity - level.onHand;
      if (delta === 0) throw new InventoryError("NO_CHANGE", "Jumlah stok sudah sama, tidak ada yang diubah.");
    } else {
      delta = body.quantity;
      unitCost = body.unitCost ?? null;
    }
    const [result] = await recordMovements(
      tx,
      {
        tenantId: ctx.tenantId,
        sourceType: "adjustment",
        sourceId: adjustmentId,
        actor: { kind: "user", id: ctx.actorUserId },
        correlationId: ctx.correlationId,
      },
      [
        {
          outletId: body.outletId,
          variantId: body.variantId,
          delta,
          reason: body.mode === "set" ? "adjustment" : "purchase",
          unitCost,
          note: body.note,
        },
      ],
    );
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: body.mode === "set" ? "stock.adjusted" : "stock.received",
      entity: `variant:${body.variantId}`,
      after: { outletId: body.outletId, delta, unitCost, onHand: result!.onHand, note: body.note ?? null },
    });
    return result!;
  });
}
