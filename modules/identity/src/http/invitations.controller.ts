import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  GoneException,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { InviteMemberBody } from "@wadar/contracts";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import {
  acceptInvitation,
  AlreadyMemberError,
  InvitationNotAcceptableError,
  InvitationNotFoundError,
} from "../application/accept-invitation.js";
import { getInvitationPreview } from "../application/get-invitation-preview.js";
import { inviteMember, RoleNotFoundError } from "../application/invite-member.js";
import { listTenantInvitations } from "../application/list-invitations.js";
import { Permission } from "../domain/role.js";
import { PermissionGuard, RequirePermission } from "./permission.guard.js";
import { SupabaseJwtGuard } from "./supabase-jwt.guard.js";
import { TenantGuard } from "./tenant.guard.js";

@Controller("v1/invitations")
export class InvitationsController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  @Get()
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.TeamManage)
  async list(@Req() request: FastifyRequest) {
    return listTenantInvitations(this.db, request.tenant!.tenantId);
  }

  @Post()
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.TeamManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async invite(
    @Body(new ZodValidationPipe(InviteMemberBody)) body: InviteMemberBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId: string | undefined,
  ) {
    try {
      return await inviteMember(this.db, {
        tenantId: request.tenant!.tenantId,
        invitedByUserId: request.user!.id,
        email: body.email,
        phone: body.phone,
        roleKey: body.roleKey,
        correlationId: correlationId ?? randomUUID(),
      });
    } catch (error) {
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

  /**
   * Unauthenticated preview for the "kamu diundang" accept screen —
   * deliberately no guards at all: the person isn't signed in yet. Safe
   * because access is gated by knowing `token` itself (a high-entropy
   * secret), not by any tenant check — see db/schema.ts's
   * `invitation_token_lookup` RLS policy.
   */
  @Get(":token")
  async preview(@Param("token") token: string) {
    const preview = await getInvitationPreview(this.db, token);
    if (!preview) {
      throw new NotFoundException({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Invitation not found",
        code: "INVITATION_NOT_FOUND",
      });
    }
    return preview;
  }

  @Post(":token/accept")
  @HttpCode(200)
  @UseGuards(SupabaseJwtGuard)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async accept(
    @Param("token") token: string,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId: string | undefined,
  ) {
    try {
      return await acceptInvitation(this.db, {
        token,
        acceptingUserId: request.user!.id,
        correlationId: correlationId ?? randomUUID(),
      });
    } catch (error) {
      if (error instanceof InvitationNotFoundError) {
        throw new NotFoundException({
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: error.message,
          code: "INVITATION_NOT_FOUND",
        });
      }
      if (error instanceof InvitationNotAcceptableError) {
        throw new GoneException({
          type: "about:blank",
          title: "Gone",
          status: 410,
          detail: error.message,
          code: "INVITATION_NOT_ACCEPTABLE",
        });
      }
      if (error instanceof AlreadyMemberError) {
        throw new ConflictException({
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: error.message,
          code: "ALREADY_MEMBER",
        });
      }
      throw error;
    }
  }
}
