import { registerWriteIsolationCase } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { SystemRole } from "../domain/role.js";
import { insertMembership } from "../infra/memberships.repository.js";
import { getRoleByKey } from "../infra/roles.repository.js";

let registered = false;

/**
 * Registers identity's one representative write-isolation case (design
 * decision #6 in the M1 plan): `PATCH /v1/memberships/:id/role`, the clear
 * example of a write route that targets an existing resource by id.
 * Pure-creation routes (`POST /v1/outlets`, `POST /v1/invitations`)
 * deliberately don't get one — they can't act on another tenant's resource
 * at all, since `TenantGuard`'s own membership check already rejects the
 * request before any handler code runs; there's no "victim resource ID" to
 * attack the way a PATCH-by-id route has.
 *
 * `createFixture` assumes `tenantAId` already went through the normal
 * `create-tenant` command (so its 5 system roles already exist) — it does
 * NOT reseed roles itself, which would violate the
 * `roles_tenant_id_key_idx` unique index.
 *
 * Called once from `identity.module.ts` at module load (module-level
 * `registerWriteIsolationCase` calls are otherwise idempotent-unsafe to
 * repeat, hence the `registered` guard) — see
 * `modules/platform/src/testing/tenant-isolation.ts` for the shared runner
 * every module's write cases funnel into.
 */
export function registerIdentityWriteIsolationCases(): void {
  if (registered) return;
  registered = true;

  registerWriteIsolationCase({
    module: "identity",
    method: "PATCH",
    path: (membershipId) => `/v1/memberships/${membershipId}/role`,
    createFixture: async (tx, tenantAId) => {
      const cashierRole = await getRoleByKey(tx, tenantAId, SystemRole.Cashier);
      if (!cashierRole) {
        throw new Error(
          "tenant-isolation fixture expected tenantAId to already have system roles seeded (create it via create-tenant first)",
        );
      }
      const membershipId = uuidv7();
      await insertMembership(tx, {
        id: membershipId,
        tenantId: tenantAId,
        userId: uuidv7(),
        roleId: cashierRole.id,
      });
      return { id: membershipId };
    },
  });
}
