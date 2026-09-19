import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { Permission } from "../domain/role.js";

export const REQUIRE_PERMISSION_METADATA_KEY = "wadar:require-permission";

/** Must run after `TenantGuard` (needs `request.tenant.permissions`). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_METADATA_KEY, permission);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRE_PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.tenant?.permissions.includes(required)) {
      throw new ForbiddenException({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: `Missing permission: ${required}`,
        code: "PERMISSION_DENIED",
      });
    }
    return true;
  }
}
