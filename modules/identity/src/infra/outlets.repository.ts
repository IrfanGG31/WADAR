import type { Tx } from "@wadar/platform";
import { eq } from "drizzle-orm";
import { outlets } from "../db/schema.js";

export interface NewOutletRow {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
}

export async function insertOutlet(tx: Tx, row: NewOutletRow): Promise<void> {
  await tx.insert(outlets).values(row);
}

export async function listOutlets(tx: Tx, tenantId: string): Promise<Array<typeof outlets.$inferSelect>> {
  return tx.select().from(outlets).where(eq(outlets.tenantId, tenantId));
}
