import { and, eq, inArray, sql } from "drizzle-orm";
import { outbox } from "../db/schema.js";
import type { Db } from "./db.js";

export type Tx = Parameters<Db["transaction"]>[0] extends (tx: infer T) => unknown
  ? T
  : never;

export interface NewOutboxRow {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}

export async function insertOutboxPending(tx: Tx, row: NewOutboxRow): Promise<void> {
  await tx.insert(outbox).values({
    id: row.id,
    tenantId: row.tenantId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    payload: row.payload,
    status: "pending",
  });
}

/**
 * Locks up to `limit` pending rows for this relay tick. Must run inside a
 * transaction — the lock is what makes concurrent relay instances safe
 * (`SKIP LOCKED` means a second poller never grabs a row the first is already
 * handling). See docs/ARCHITECTURE.md §4.3.
 */
export async function claimPendingBatch(
  tx: Tx,
  limit: number,
): Promise<Array<typeof outbox.$inferSelect>> {
  return tx
    .select()
    .from(outbox)
    .where(eq(outbox.status, "pending"))
    .orderBy(outbox.createdAt)
    .limit(limit)
    .for("update", { skipLocked: true });
}

/**
 * Marks rows published. Must only be called AFTER the corresponding BullMQ
 * publish has been confirmed to succeed — never before (docs/ARCHITECTURE.md
 * §8: outbox must not lose events if Redis is briefly unavailable).
 */
export async function markPublished(tx: Tx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(outbox)
    .set({ status: "published", publishedAt: sql`now()` })
    .where(and(inArray(outbox.id, ids), eq(outbox.status, "pending")));
}
