import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { CreateOutletBody } from "@wadar/contracts";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createOutlet } from "../application/create-outlet.js";
import { listTenantOutlets } from "../application/list-outlets.js";
import { Permission } from "../domain/role.js";
import { PermissionGuard, RequirePermission } from "./permission.guard.js";
import { SupabaseJwtGuard } from "./supabase-jwt.guard.js";
import { TenantGuard } from "./tenant.guard.js";

@Controller("v1/outlets")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class OutletsController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  @Get()
  @TenantScoped()
  async list(@Req() request: FastifyRequest) {
    return listTenantOutlets(this.db, request.tenant!.tenantId);
  }

  @Post()
  @TenantScoped()
  @RequirePermission(Permission.SettingsManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async create(
    @Body(new ZodValidationPipe(CreateOutletBody)) body: CreateOutletBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId: string | undefined,
  ) {
    return createOutlet(this.db, {
      tenantId: request.tenant!.tenantId,
      name: body.name,
      address: body.address,
      actorUserId: request.user!.id,
      correlationId: correlationId ?? randomUUID(),
    });
  }
}
