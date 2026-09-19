/**
 * Public API of the `identity` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1). Do not import from `domain/`, `application/`,
 * `infra/`, `http/`, or `db/schema.ts` directly from outside this module.
 */
export { IdentityModule, type IdentityModuleOptions } from "./identity.module.js";
export {
  Permission,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_DISPLAY_NAME,
  SystemRole,
  permissionsForRole,
  roleHasPermission,
} from "./domain/role.js";
export { PermissionGuard, RequirePermission } from "./http/permission.guard.js";
export { SupabaseJwtGuard, type SupabaseJwtGuardOptions, type AuthenticatedUser } from "./http/supabase-jwt.guard.js";
export { TenantGuard, type TenantRequestContext } from "./http/tenant.guard.js";
