import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PLATFORM_DB, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { getMembership } from "../application/get-membership.js";
import { permissionsForRole, type Permission, type SystemRole } from "../domain/role.js";

export interface TenantRequestContext {
  tenantId: string;
  membershipId: string;
  roleKey: SystemRole;
  permissions: readonly Permission[];
}

declare module "fastify" {
  interface FastifyRequest {
    tenant?: TenantRequestContext;
  }
}

function forbidden(detail: string, code: string) {
  return { type: "about:blank", title: "Forbidden", status: 403, detail, code };
}

/**
 * Reads the CLAIMED `x-tenant-id` header (not yet verified) and looks up
 * the caller's membership for it — see design decision #4 in the M1 plan
 * for why this is safe even though the claim is unverified: the lookup runs
 * inside `withTenantContext(db, claimedTenantId, ...)` (so RLS scopes it to
 * that tenant) AND is filtered by `user_id = req.user.id` at the app layer
 * (via `getMembershipByUser`'s WHERE clause). A non-member gets 0 rows ->
 * 403, never another tenant's data — both layers have to agree, not just
 * one. Must run AFTER `SupabaseJwtGuard` (needs `request.user`).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const tenantIdClaim = request.headers["x-tenant-id"];

    if (typeof tenantIdClaim !== "string" || tenantIdClaim.length === 0) {
      throw new ForbiddenException(forbidden("Missing x-tenant-id header", "TENANT_ID_REQUIRED"));
    }
    if (!request.user) {
      throw new ForbiddenException(forbidden("Missing authenticated user", "AUTH_REQUIRED"));
    }

    const membership = await getMembership(this.db, tenantIdClaim, request.user.id);
    if (!membership) {
      throw new ForbiddenException(forbidden("Not a member of this tenant", "TENANT_FORBIDDEN"));
    }

    const roleKey = membership.roleKey as SystemRole;
    request.tenant = {
      tenantId: membership.tenantId,
      membershipId: membership.membershipId,
      roleKey,
      permissions: permissionsForRole(roleKey),
    };
    return true;
  }
}
