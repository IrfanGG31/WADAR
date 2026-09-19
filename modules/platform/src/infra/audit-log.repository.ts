import { auditLog } from "../db/schema.js";
import type { Tx } from "./outbox.repository.js";

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  entity: string;
  before?: unknown;
  after?: unknown;
}

export async function insertAuditLog(tx: Tx, entry: AuditLogEntry): Promise<void> {
  await tx.insert(auditLog).values(entry);
}
