import { eq } from "drizzle-orm";
import { idempotencyKeys } from "../db/schema.js";
import type { Db } from "./db.js";

const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

export async function getSnapshot(db: Db, key: string): Promise<unknown | undefined> {
  const [row] = await db
    .select({ responseSnapshot: idempotencyKeys.responseSnapshot })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);
  return row?.responseSnapshot;
}

export async function saveSnapshot(
  db: Db,
  key: string,
  tenantId: string,
  responseSnapshot: unknown,
): Promise<void> {
  await db
    .insert(idempotencyKeys)
    .values({
      key,
      tenantId,
      responseSnapshot,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
    })
    .onConflictDoNothing({ target: idempotencyKeys.key });
}
