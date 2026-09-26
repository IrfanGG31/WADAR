import {
  CatalogPriceChangedV1,
  CatalogVariantsCreatedV1,
  SalesOrderCompletedV1,
  SalesOrderVoidedV1,
} from "@wadar/contracts";
import type { EventBus, EventMeta, Tx } from "@wadar/platform";
import { levelsForVariantAllOutlets } from "../infra/stock.repository.js";
import { recordMovements, type MovementContext } from "./record-movements.js";

export const INVENTORY_CONSUMER = "inventory";

function systemContext(tenantId: string, meta: EventMeta, sourceType: string, sourceId: string): MovementContext {
  return {
    tenantId,
    sourceType,
    sourceId,
    actor: { kind: "system", id: `event:${meta.eventType}` },
    correlationId: meta.eventId,
    causationId: meta.eventId,
  };
}

async function onVariantsCreated(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = CatalogVariantsCreatedV1.parse(payload);
  const opening = event.variants.filter((v) => v.initialStock > 0);
  if (opening.length === 0) return;
  await recordMovements(
    tx,
    systemContext(tenantId, meta, "product", event.productId),
    opening.map((v) => ({
      outletId: event.outletId,
      variantId: v.variantId,
      delta: v.initialStock,
      reason: "opening" as const,
      unitCost: v.cost,
    })),
  );
}

/** Owner edited HPP in the catalog → that becomes the average cost everywhere (explicit revaluation). */
async function onPriceChanged(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = CatalogPriceChangedV1.parse(payload);
  if (event.newCost === null || event.newCost === event.oldCost) return;
  const levels = await levelsForVariantAllOutlets(tx, tenantId, event.variantId);
  if (levels.length === 0) return;
  await recordMovements(
    tx,
    systemContext(tenantId, meta, "revaluation", meta.eventId),
    levels.map((level) => ({
      outletId: level.outletId,
      variantId: event.variantId,
      delta: 0,
      reason: "adjustment" as const,
      revalueTo: event.newCost,
      note: "HPP diubah",
    })),
  );
}

async function onOrderCompleted(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = SalesOrderCompletedV1.parse(payload);
  await recordMovements(
    tx,
    systemContext(tenantId, meta, "order", event.orderId),
    event.lines.map((line) => ({
      outletId: event.outletId,
      variantId: line.variantId,
      delta: -line.qty,
      reason: "sale" as const,
      note: `Pesanan ${event.orderNumber}`,
    })),
  );
}

async function onOrderVoided(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = SalesOrderVoidedV1.parse(payload);
  await recordMovements(
    tx,
    systemContext(tenantId, meta, "order_void", event.orderId),
    event.lines.map((line) => ({
      outletId: event.outletId,
      variantId: line.variantId,
      delta: line.qty,
      reason: "void" as const,
      unitCost: line.unitCost > 0 ? line.unitCost : null,
      note: `Batal ${event.orderNumber}`,
    })),
  );
}

export function registerInventoryConsumers(eventBus: EventBus): void {
  eventBus.registerHandler("catalog.product.created", INVENTORY_CONSUMER, onVariantsCreated);
  eventBus.registerHandler("catalog.variant.created", INVENTORY_CONSUMER, onVariantsCreated);
  eventBus.registerHandler("catalog.price.changed", INVENTORY_CONSUMER, onPriceChanged);
  eventBus.registerHandler("sales.order.completed", INVENTORY_CONSUMER, onOrderCompleted);
  eventBus.registerHandler("sales.order.voided", INVENTORY_CONSUMER, onOrderVoided);
}
