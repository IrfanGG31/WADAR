import { SetMetadata } from "@nestjs/common";

export const TENANT_SCOPED_METADATA_KEY = "wadar:tenant-scoped";

/**
 * Marks a controller/handler as reading or writing tenant-scoped data, for
 * `modules/platform/src/testing/tenant-isolation.ts` to auto-discover and
 * test (docs/BUILD-PLAN.md M1 DoD: every new tenant-scoped route is covered
 * automatically).
 *
 * Deliberately pure metadata (`SetMetadata`), not tied to any guard class:
 * checking "does this route use `TenantGuard`" would require `platform` to
 * import a class living in `modules/identity/http/`, which is a backwards
 * dependency (identity already depends on platform) that
 * `.dependency-cruiser.cjs`'s `no-circular` rule would reject. Apply this
 * decorator explicitly, separately from whatever `@UseGuards(...)` the
 * route also has.
 */
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_METADATA_KEY, true);
