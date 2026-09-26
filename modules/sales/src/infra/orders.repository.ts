import type { Tx } from "@wadar/platform";
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { channelSettings, orderCounters, orderLines, orderPayments, orders, orderVoids } from "../db/schema.js";

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type OrderPaymentRow = typeof orderPayments.$inferSelect;
export type OrderVoidRow = typeof orderVoids.$inferSelect;

export async function findOrderByIdempotencyKey(tx: Tx, tenantId: string, key: string): Promise<OrderRow | undefined> {
  const [row] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.idempotencyKey, key)));
  return row;
}

export async function findOrder(tx: Tx, tenantId: string, orderId: string): Promise<OrderRow | undefined> {
  const [row] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
  return row;
}

export async function loadOrderParts(tx: Tx, tenantId: string, orderId: string) {
  const [lines, payments, voids] = await Promise.all([
    tx.select().from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId))),
    tx
      .select()
      .from(orderPayments)
      .where(and(eq(orderPayments.tenantId, tenantId), eq(orderPayments.orderId, orderId)))
      .orderBy(orderPayments.createdAt),
    tx.select().from(orderVoids).where(and(eq(orderVoids.tenantId, tenantId), eq(orderVoids.orderId, orderId))),
  ]);
  return { lines, payments, void: voids[0] };
}

export async function nextOrderSequence(tx: Tx, tenantId: string, dayKey: string): Promise<number> {
  const [row] = await tx
    .insert(orderCounters)
    .values({ tenantId, dayKey, lastValue: 1 })
    .onConflictDoUpdate({
      target: [orderCounters.tenantId, orderCounters.dayKey],
      set: { lastValue: sql`${orderCounters.lastValue} + 1` },
    })
    .returning({ value: orderCounters.lastValue });
  return row!.value;
}

export async function insertOrder(
  tx: Tx,
  order: typeof orders.$inferInsert,
  lines: Array<typeof orderLines.$inferInsert>,
  payments: Array<typeof orderPayments.$inferInsert>,
): Promise<void> {
  await tx.insert(orders).values(order);
  await tx.insert(orderLines).values(lines);
  if (payments.length > 0) await tx.insert(orderPayments).values(payments);
}

export async function insertPayment(tx: Tx, payment: typeof orderPayments.$inferInsert): Promise<boolean> {
  const inserted = await tx
    .insert(orderPayments)
    .values(payment)
    .onConflictDoNothing()
    .returning({ id: orderPayments.id });
  return inserted.length === 1;
}

export async function insertVoid(tx: Tx, row: typeof orderVoids.$inferInsert): Promise<boolean> {
  const inserted = await tx.insert(orderVoids).values(row).onConflictDoNothing().returning({ id: orderVoids.id });
  return inserted.length === 1;
}

export async function commissionBpsFor(tx: Tx, tenantId: string, channel: OrderRow["channel"]): Promise<number> {
  const [row] = await tx
    .select({ bps: channelSettings.commissionBps })
    .from(channelSettings)
    .where(and(eq(channelSettings.tenantId, tenantId), eq(channelSettings.channel, channel)));
  return row?.bps ?? 0;
}

export async function listChannelSettings(tx: Tx, tenantId: string) {
  return tx.select().from(channelSettings).where(eq(channelSettings.tenantId, tenantId));
}

export async function upsertChannelSetting(tx: Tx, tenantId: string, channel: OrderRow["channel"], commissionBps: number) {
  await tx
    .insert(channelSettings)
    .values({ tenantId, channel, commissionBps })
    .onConflictDoUpdate({
      target: [channelSettings.tenantId, channelSettings.channel],
      set: { commissionBps, updatedAt: new Date() },
    });
}

export interface ListOrdersFilter {
  from?: Date;
  to?: Date;
  channel?: OrderRow["channel"];
  outletId?: string;
  /** Opaque cursor: `${completedAtIso}|${id}` of the last item of the previous page. */
  cursor?: { completedAt: Date; id: string };
  limit: number;
}

export async function listOrderRows(tx: Tx, tenantId: string, filter: ListOrdersFilter) {
  const conditions: SQL[] = [eq(orders.tenantId, tenantId)];
  if (filter.from) conditions.push(sql`${orders.completedAt} >= ${filter.from.toISOString()}`);
  if (filter.to) conditions.push(sql`${orders.completedAt} < ${filter.to.toISOString()}`);
  if (filter.channel) conditions.push(eq(orders.channel, filter.channel));
  if (filter.outletId) conditions.push(eq(orders.outletId, filter.outletId));
  if (filter.cursor) {
    conditions.push(
      or(
        lt(orders.completedAt, filter.cursor.completedAt),
        and(eq(orders.completedAt, filter.cursor.completedAt), lt(orders.id, filter.cursor.id)),
      )!,
    );
  }
  const rows = await tx
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.completedAt), desc(orders.id))
    .limit(filter.limit + 1);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { rows, lineCounts: new Map<string, number>(), paid: new Map<string, number>(), voided: new Set<string>() };
  const [counts, paidRows, voidRows] = await Promise.all([
    tx
      .select({ orderId: orderLines.orderId, items: sql<string>`sum(${orderLines.qty})` })
      .from(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.orderId, ids)))
      .groupBy(orderLines.orderId),
    tx
      .select({ orderId: orderPayments.orderId, paid: sql<string>`sum(${orderPayments.amount})` })
      .from(orderPayments)
      .where(and(eq(orderPayments.tenantId, tenantId), inArray(orderPayments.orderId, ids)))
      .groupBy(orderPayments.orderId),
    tx
      .select({ orderId: orderVoids.orderId })
      .from(orderVoids)
      .where(and(eq(orderVoids.tenantId, tenantId), inArray(orderVoids.orderId, ids))),
  ]);
  return {
    rows,
    lineCounts: new Map(counts.map((c) => [c.orderId, Number(c.items)])),
    paid: new Map(paidRows.map((p) => [p.orderId, Number(p.paid)])),
    voided: new Set(voidRows.map((v) => v.orderId)),
  };
}
