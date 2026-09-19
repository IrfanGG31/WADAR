import { pings } from "../db/schema.js";
import type { Tx } from "./outbox.repository.js";

export interface NewPing {
  id: string;
  tenantId: string;
  message: string;
}

export async function insertPing(tx: Tx, row: NewPing): Promise<void> {
  await tx.insert(pings).values(row);
}
