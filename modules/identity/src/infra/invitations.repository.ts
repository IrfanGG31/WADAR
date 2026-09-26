import type { Db, Tx } from "@wadar/platform";
import { and, eq, sql } from "drizzle-orm";
import { invitations } from "../db/schema.js";

export interface NewInvitationRow {
  id: string;
  tenantId: string;
  email?: string;
  phone?: string;
  roleId: string;
  token: string;
  invitedBy: string;
  expiresAt: Date;
}

export async function insertInvitation(tx: Tx, row: NewInvitationRow): Promise<void> {
  await tx.insert(invitations).values(row);
}

export async function listInvitations(
  tx: Tx,
  tenantId: string,
): Promise<Array<typeof invitations.$inferSelect>> {
  return tx.select().from(invitations).where(eq(invitations.tenantId, tenantId));
}

export async function markInvitationAccepted(tx: Tx, invitationId: string): Promise<void> {
  await tx
    .update(invitations)
    .set({ status: "accepted", acceptedAt: sql`now()` })
    .where(eq(invitations.id, invitationId));
}

/**
 * The one legitimate RLS-protected read that happens BEFORE the caller has
 * a known tenant context — see the `invitation_token_lookup` policy comment
 * in `db/schema.ts` and `application/accept-invitation.ts`. Runs in its own
 * short transaction (not `withTenantContext`, since the tenant isn't known
 * yet) that sets `app.invitation_lookup_token` instead of `app.tenant_id`.
 */
export async function findInvitationByToken(
  db: Db,
  token: string,
): Promise<typeof invitations.$inferSelect | undefined> {
  return db.transaction(async (tx) => {
    // Postgres evaluates EVERY permissive policy's expression, including
    // tenant_isolation's strict `current_setting('app.tenant_id')::uuid` —
    // which throws when unset (fresh connection) or '' (a pooled connection
    // that previously ran withTenantContext). Pinning it to the nil UUID
    // makes tenant_isolation match nothing without erroring, so only the
    // token policy can grant this read.
    await tx.execute(sql`select set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true)`);
    await tx.execute(sql`select set_config('app.invitation_lookup_token', ${token}, true)`);
    const [row] = await tx.select().from(invitations).where(eq(invitations.token, token));
    return row;
  });
}

export async function getInvitationById(
  tx: Tx,
  tenantId: string,
  invitationId: string,
): Promise<typeof invitations.$inferSelect | undefined> {
  const [row] = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.tenantId, tenantId), eq(invitations.id, invitationId)));
  return row;
}
