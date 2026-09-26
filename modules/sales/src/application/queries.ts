import type { OrderListPage, OrderView, PublicReceipt, SalesChannel } from "@wadar/contracts";
import { getOutletInfo, getTenantProfile } from "@wadar/identity";
import { withTenantContext, type Db, type Tx } from "@wadar/platform";
import { findOrder, listChannelSettings, listOrderRows, loadOrderParts } from "../infra/orders.repository.js";
import { buildOrderView, paymentStatus } from "./order-view.js";
import { verifyReceiptToken } from "./receipt-token.js";

export async function getOrder(
  db: Db,
  tenantId: string,
  orderId: string,
  options: { includeCost: boolean; receiptSecret: string },
): Promise<OrderView | undefined> {
  return withTenantContext(db, tenantId, async (tx) => {
    const order = await findOrder(tx, tenantId, orderId);
    return order ? buildOrderView(tx, order, options) : undefined;
  });
}

export function encodeCursor(completedAt: Date, id: string): string {
  return Buffer.from(`${completedAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { completedAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const completedAt = new Date(iso ?? "");
  if (!id || Number.isNaN(completedAt.getTime())) return undefined;
  return { completedAt, id };
}

export async function listOrders(
  db: Db,
  tenantId: string,
  filter: { from?: Date; to?: Date; channel?: SalesChannel; outletId?: string; cursor?: string; limit: number },
): Promise<OrderListPage> {
  return withTenantContext(db, tenantId, async (tx) => {
    const { rows, lineCounts, paid, voided } = await listOrderRows(tx, tenantId, {
      ...filter,
      cursor: decodeCursor(filter.cursor),
    });
    const page = rows.slice(0, filter.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        channel: row.channel,
        status: voided.has(row.id) ? "voided" : "completed",
        paymentStatus: paymentStatus(row.net, paid.get(row.id) ?? 0),
        net: row.net,
        itemCount: lineCounts.get(row.id) ?? 0,
        completedAt: row.completedAt.toISOString(),
      })),
      nextCursor: rows.length > filter.limit && last ? encodeCursor(last.completedAt, last.id) : null,
    };
  });
}

/** No auth: the signed token IS the authorization, and it scopes the tenant context. */
export async function getPublicReceipt(db: Db, secret: string, token: string): Promise<PublicReceipt | undefined> {
  const claims = verifyReceiptToken(secret, token);
  if (!claims) return undefined;
  return withTenantContext(db, claims.tenantId, async (tx) => {
    const order = await findOrder(tx, claims.tenantId, claims.orderId);
    if (!order) return undefined;
    const [parts, tenant, outlet] = await Promise.all([
      loadOrderParts(tx, claims.tenantId, order.id),
      getTenantProfile(tx, claims.tenantId),
      getOutletInfo(tx, claims.tenantId, order.outletId),
    ]);
    const paid = parts.payments.reduce((s, p) => s + p.amount, 0);
    const cash = parts.payments.find((p) => p.method === "cash" && p.tendered !== null);
    return {
      storeName: tenant?.name ?? "",
      outletName: outlet?.name ?? "",
      outletAddress: outlet?.address ?? null,
      orderNumber: order.orderNumber,
      completedAt: order.completedAt.toISOString(),
      timezone: tenant?.timezone ?? "Asia/Jakarta",
      status: parts.void ? "voided" : "completed",
      lines: parts.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, netAmount: l.netAmount })),
      gross: order.gross,
      discount: order.discount,
      net: order.net,
      paid,
      change: cash ? cash.tendered! - cash.amount : 0,
      paymentMethod: parts.payments[0]?.method ?? null,
    };
  });
}

export async function getChannelSettings(db: Db, tenantId: string) {
  const rows = await withTenantContext(db, tenantId, (tx) => listChannelSettings(tx, tenantId));
  return rows.map((r) => ({ channel: r.channel, commissionBps: r.commissionBps }));
}

export interface OrderPaymentState {
  orderId: string;
  orderNumber: string;
  outletId: string;
  net: number;
  paid: number;
  outstanding: number;
  voided: boolean;
}

/** Port for payments: what's still owed on an order (e.g. to create a QRIS for the right amount). */
export async function getOrderPaymentState(tx: Tx, tenantId: string, orderId: string): Promise<OrderPaymentState | undefined> {
  const order = await findOrder(tx, tenantId, orderId);
  if (!order) return undefined;
  const parts = await loadOrderParts(tx, tenantId, orderId);
  const paid = parts.payments.reduce((s, p) => s + p.amount, 0);
  return {
    orderId,
    orderNumber: order.orderNumber,
    outletId: order.outletId,
    net: order.net,
    paid,
    outstanding: Math.max(order.net - paid, 0),
    voided: parts.void !== undefined,
  };
}
