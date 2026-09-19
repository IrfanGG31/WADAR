import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ChangeRoleBody } from "@wadar/contracts";
import { PLATFORM_DB, TenantScoped, ZodValidationPipe, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { changeRole, MembershipNotFoundError, RoleNotFoundError } from "../application/change-role.js";
import { listTenantMemberships } from "../application/list-memberships.js";
import { Permission } from "../domain/role.js";
import { PermissionGuard, RequirePermission } from "./permission.guard.js";
import { SupabaseJwtGuard } from "./supabase-jwt.guard.js";
import { TenantGuard } from "./tenant.guard.js";

@Controller("v1/memberships")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class MembershipsController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  @Get()
  @TenantScoped()
  @RequirePermission(Permission.TeamManage)
  async list(@Req() request: FastifyRequest) {
    return listTenantMemberships(this.db, request.tenant!.tenantId);
  }

  /**
   * The caller's own membership/role/permissions — deliberately no
   * `@RequirePermission()`: every tenant member (not just ones with
   * `TeamManage`) needs this to know which nav items to show
   * (docs/BUILD-PLAN.md M1 DoD: "kasir hanya melihat menu sesuai peran").
   * `TenantGuard` already resolved all of this onto `request.tenant` — no
   * extra DB query needed here.
   */
  @Get("me")
  @TenantScoped()
  me(@Req() request: FastifyRequest) {
    return {
      membershipId: request.tenant!.membershipId,
      tenantId: request.tenant!.tenantId,
      roleKey: request.tenant!.roleKey,
      permissions: request.tenant!.permissions,
    };
  }

  @Patch(":membershipId/role")
  @TenantScoped()
  @RequirePermission(Permission.TeamManage)
  async changeRole(
    @Param("membershipId") membershipId: string,
    @Body(new ZodValidationPipe(ChangeRoleBody)) body: ChangeRoleBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId: string | undefined,
  ) {
    try {
      await changeRole(this.db, {
        tenantId: request.tenant!.tenantId,
        membershipId,
        newRoleKey: body.roleKey,
        actorUserId: request.user!.id,
        correlationId: correlationId ?? randomUUID(),
      });
      return { status: "ok" };
    } catch (error) {
      if (error instanceof MembershipNotFoundError) {
        throw new NotFoundException({
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: error.message,
          code: "MEMBERSHIP_NOT_FOUND",
        });
      }
      if (error instanceof RoleNotFoundError) {
        throw new BadRequestException({
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: error.message,
          code: "ROLE_NOT_FOUND",
        });
      }
      throw error;
    }
  }
}
