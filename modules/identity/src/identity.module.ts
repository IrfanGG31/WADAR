import { Module, type DynamicModule } from "@nestjs/common";
import { InvitationsController } from "./http/invitations.controller.js";
import { MembershipsController } from "./http/memberships.controller.js";
import { OutletsController } from "./http/outlets.controller.js";
import { PermissionGuard } from "./http/permission.guard.js";
import { SupabaseJwtGuard, type SupabaseJwtGuardOptions } from "./http/supabase-jwt.guard.js";
import { TenantGuard } from "./http/tenant.guard.js";
import { TenantsController } from "./http/tenants.controller.js";
import { IDENTITY_JWT_OPTIONS } from "./http/tokens.js";
import { registerIdentityWriteIsolationCases } from "./testing/tenant-isolation-fixtures.js";

export interface IdentityModuleOptions {
  supabaseJwt: SupabaseJwtGuardOptions;
}

@Module({})
export class IdentityModule {
  static forRoot(options: IdentityModuleOptions): DynamicModule {
    // Runs once per process boot, populating platform's shared write-case
    // registry before any tenant-isolation test suite reads it (design
    // decision #6 — see testing/tenant-isolation-fixtures.ts).
    registerIdentityWriteIsolationCases();

    return {
      module: IdentityModule,
      controllers: [TenantsController, OutletsController, MembershipsController, InvitationsController],
      providers: [
        { provide: IDENTITY_JWT_OPTIONS, useValue: options.supabaseJwt },
        SupabaseJwtGuard,
        TenantGuard,
        PermissionGuard,
      ],
    };
  }
}
