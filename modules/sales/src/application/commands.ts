import { getVariantsForSale } from "@wadar/catalog";
import type { CompleteOrderBody, OrderView, SalesChannel, SetChannelCommissionBody } from "@wadar/contracts";
import { localDateKey } from "@wadar/core";
import { getTenantTimezone, outletBelongsToTenant } from "@wadar/identity";
import { getStockSnapshot } from "@wadar/inventory";
import { emitEvent, insertAuditLog, withTenantContext, type Db, type Tx } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { PricingError, cashChange, priceOrder } from "../domain/pricing.js";
import {
  commissionBpsFor,
  findOrder,
  findOrderByIdempotencyKey,
  insertOrder,
  insertVoid,
  loadOrderParts,
  nextOrderSequence,
  upsertChannelSetting,
} from "../infra/orders.repository.js";
import { buildOrderView } from "./order-view.js";

export interface SalesContext {
  tenantId: string;
  actorUserId: string;
  correlationId: string;
  includeCost: boolean;
  receiptSecret: string;
}

export class SalesError extends Error {
  constructor(
    readonly code:
      | "OUTLET_NOT_FOUND"
      | "PRODUCT_UNAVAILABLE"
      | "CASH_NOT_ENOUGH"
      | "LINE_DISCOUNT_TOO_LARGE"
      | "ORDER_DISCOUNT_TOO_LARGE"
      | "ORDER_NOT_FOUND"
      | "ALREADY_VOIDED",
    message: string,
    readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The POS checkout (PRD O2.1–O2.2, BUILD-PLAN M3): prices the cart from the
 * catalog (never from client-supplied prices), snapshots moving-average
 * HPP from inventory, writes the immutable order and emits
 * `sales.order.completed` in ONE transaction (CLAUDE.md aturan #5).
 * Stock, ledger and dashboards react to that event.
 *
 * Idempotent on the Idempotency-Key (CLAUDE.md aturan #6): a retry returns
 * the order the first attempt created, even under a concurrent race (the
 * unique index is the real guard; the pre-check is the fast path).
 */
export async function completeOrder(
  db: Db,
  ctx: SalesContext & { idempotencyKey: string },
  body: CompleteOrderBody,
): Promise<OrderView> {
  try {
    return await withTenantContext(db, ctx.tenantId, (tx) => completeOrderInTx(tx, ctx, body));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return withTenantContext(db, ctx.tenantId, async (tx) => {
      const existing = await findOrderByIdempotencyKey(tx, ctx.tenantId, ctx.idempotencyKey);
      if (!existing) throw error;
      return buildOrderView(tx, existing, ctx);
    });
  }
}

async function completeOrderInTx(tx: Tx, ctx: SalesContext & { idempotencyKey: string }, body: CompleteOrderBody): Promise<OrderView> {
  const existing = await findOrderByIdempotencyKey(tx, ctx.tenantId, ctx.idempotencyKey);
  if (existing) return buildOrderView(tx, existing, ctx);

  if (!(await outletBelongsToTenant(tx, ctx.tenantId, body.outletId))) {
    throw new SalesError("OUTLET_NOT_FOUND", "Outlet tidak ditemukan.", 404);
  }

  const variantIds = body.lines.map((l) => l.variantId);
  const [variants, stock, timezone, commissionBps] = await Promise.all([
    getVariantsForSale(tx, ctx.tenantId, variantIds),
    getStockSnapshot(tx, ctx.tenantId, body.outletId, variantIds),
    getTenantTimezone(tx, ctx.tenantId),
    commissionBpsFor(tx, ctx.tenantId, body.channel),
  ]);
  const byId = new Map(variants.map((v) => [v.variantId, v]));
  const unavailable = body.lines.find((l) => !byId.get(l.variantId) || byId.get(l.variantId)!.archived);
  if (unavailable) {
    throw new SalesError("PRODUCT_UNAVAILABLE", "Ada produk di keranjang yang sudah tidak dijual. Hapus dari keranjang lalu coba lagi.");
  }

  let priced;
  try {
    priced = priceOrder(
      body.lines.map((l) => {
        const variant = byId.get(l.variantId)!;
        return {
          variantId: l.variantId,
          qty: l.qty,
          unitPrice: variant.channelPrices[body.channel as SalesChannel] ?? variant.price,
          lineDiscount: l.discount,
          unitCost: stock.get(l.variantId)?.avgCost ?? variant.cost ?? 0,
        };
      }),
      body.discount,
      commissionBps,
    );
  } catch (error) {
    if (error instanceof PricingError) throw new SalesError(error.code, error.message);
    throw error;
  }

  if (body.payment.method === "cash" && cashChange(priced.net, body.payment.tendered) < 0) {
    throw new SalesError("CASH_NOT_ENOUGH", "Uang yang diterima kurang dari total belanja.");
  }

  const orderId = uuidv7();
  const completedAt = new Date();
  const dayKey = localDateKey(completedAt, timezone);
  const sequence = await nextOrderSequence(tx, ctx.tenantId, dayKey);
  const orderNumber = `${dayKey.slice(2).replaceAll("-", "")}-${String(sequence).padStart(3, "0")}`;

  const lineRows = priced.lines.map((line) => {
    const variant = byId.get(line.variantId)!;
    return {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      orderId,
      variantId: line.variantId,
      productId: variant.productId,
      name: variant.variantName ? `${variant.productName} (${variant.variantName})` : variant.productName,
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineDiscount: line.lineDiscount,
      discount: line.discount,
      netAmount: line.netAmount,
      unitCost: line.unitCost,
      commission: line.commission,
    };
  });

  const paymentRows =
    body.payment.method === "qris"
      ? []
      : [
          {
            id: uuidv7(),
            tenantId: ctx.tenantId,
            orderId,
            method: body.payment.method,
            amount: priced.net,
            tendered: body.payment.method === "cash" ? body.payment.tendered : null,
            walletId: body.payment.method === "transfer" ? (body.payment.walletId ?? null) : null,
          },
        ];

  await insertOrder(
    tx,
    {
      id: orderId,
      tenantId: ctx.tenantId,
      outletId: body.outletId,
      orderNumber,
      channel: body.channel,
      idempotencyKey: ctx.idempotencyKey,
      note: body.note ?? null,
      gross: priced.gross,
      discount: priced.discount,
      net: priced.net,
      cost: priced.cost,
      commission: priced.commission,
      completedAt,
      createdBy: ctx.actorUserId,
    },
    lineRows,
    paymentRows,
  );

  await emitEvent(tx, {
    type: "sales.order.completed",
    tenantId: ctx.tenantId,
    aggregateType: "order",
    aggregateId: orderId,
    correlationId: ctx.correlationId,
    actor: { kind: "user", id: ctx.actorUserId },
    payload: {
      orderId,
      orderNumber,
      outletId: body.outletId,
      channel: body.channel,
      completedAt: completedAt.toISOString(),
      lines: lineRows.map((l) => ({
        lineId: l.id,
        variantId: l.variantId,
        productId: l.productId,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discount: l.discount,
        netAmount: l.netAmount,
        unitCost: l.unitCost,
        commission: l.commission,
      })),
      totals: { gross: priced.gross, discount: priced.discount, net: priced.net, cost: priced.cost, commission: priced.commission },
      payments: paymentRows.map((p) => ({ method: p.method, amount: p.amount, walletId: p.walletId })),
      outstanding: priced.net - paymentRows.reduce((sum, p) => sum + p.amount, 0),
      customerId: null,
    },
  });

  const order = await findOrder(tx, ctx.tenantId, orderId);
  return buildOrderView(tx, order!, ctx);
}

/**
 * Void (PRD §4 "aman untuk salah"): nothing is deleted — a void row is
 * appended, the action is audited, and `sales.order.voided` makes
 * inventory return the stock and finance post a reversing entry.
 */
export async function voidOrder(db: Db, ctx: SalesContext, orderId: string, reason: string): Promise<OrderView> {
  return withTenantContext(db, ctx.tenantId, async (tx) => {
    const order = await findOrder(tx, ctx.tenantId, orderId);
    if (!order) throw new SalesError("ORDER_NOT_FOUND", "Pesanan tidak ditemukan.", 404);
    const inserted = await insertVoid(tx, { id: uuidv7(), tenantId: ctx.tenantId, orderId, reason, voidedBy: ctx.actorUserId });
    if (!inserted) throw new SalesError("ALREADY_VOIDED", "Pesanan ini sudah dibatalkan.", 409);

    const parts = await loadOrderParts(tx, ctx.tenantId, orderId);
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: "order.voided",
      entity: `order:${orderId}`,
      before: { orderNumber: order.orderNumber, net: order.net },
      after: { reason },
    });
    await emitEvent(tx, {
      type: "sales.order.voided",
      tenantId: ctx.tenantId,
      aggregateType: "order",
      aggregateId: orderId,
      correlationId: ctx.correlationId,
      actor: { kind: "user", id: ctx.actorUserId },
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        outletId: order.outletId,
        channel: order.channel,
        voidedAt: new Date().toISOString(),
        completedAt: order.completedAt.toISOString(),
        reason,
        lines: parts.lines.map((l) => ({
          lineId: l.id,
          variantId: l.variantId,
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          netAmount: l.netAmount,
          unitCost: l.unitCost,
          commission: l.commission,
        })),
        totals: { gross: order.gross, discount: order.discount, net: order.net, cost: order.cost, commission: order.commission },
      },
    });
    return buildOrderView(tx, order, ctx);
  });
}

export async function setChannelCommission(
  db: Db,
  ctx: { tenantId: string; actorUserId: string },
  body: SetChannelCommissionBody,
): Promise<void> {
  await withTenantContext(db, ctx.tenantId, async (tx) => {
    await upsertChannelSetting(tx, ctx.tenantId, body.channel, body.commissionBps);
    await insertAuditLog(tx, {
      id: uuidv7(),
      tenantId: ctx.tenantId,
      actor: ctx.actorUserId,
      action: "channel.commission_changed",
      entity: `channel:${body.channel}`,
      after: { commissionBps: body.commissionBps },
    });
  });
}
