import { Body, Controller, Get, Headers, Inject, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { CreateTenantBody, type MyTenantView } from "@wadar/contracts";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createTenant } from "../application/create-tenant.js";
import { getTenant } from "../application/get-tenant.js";
import { listMyTenants } from "../application/list-my-tenants.js";
import { SupabaseJwtGuard } from "./supabase-jwt.guard.js";
import { TenantGuard } from "./tenant.guard.js";

@Controller("v1/tenants")
export class TenantsController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  /**
   * Onboarding — deliberately NOT `@TenantScoped()` / no `TenantGuard`: the
   * caller has no tenant yet, this endpoint creates one.
   */
  @Post()
  @UseGuards(SupabaseJwtGuard)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async create(
    @Body(new ZodValidationPipe(CreateTenantBody)) body: CreateTenantBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId: string | undefined,
  ) {
    return createTenant(this.db, {
      ownerUserId: request.user!.id,
      tenantName: body.tenantName,
      timezone: body.timezone,
      outletName: body.outletName,
      correlationId: correlationId ?? randomUUID(),
    });
  }

  /**
   * Shops the signed-in user belongs to — used right after login to reopen
   * their shop instead of the create-a-shop wizard. No `TenantGuard`: no
   * tenant is chosen yet. Only ever the caller's own memberships (JWT `sub`).
   */
  @Get("mine")
  @UseGuards(SupabaseJwtGuard)
  async mine(@Req() request: FastifyRequest): Promise<MyTenantView[]> {
    return listMyTenants(this.db, request.user!.id);
  }

  @Get("current")
  @UseGuards(SupabaseJwtGuard, TenantGuard)
  @TenantScoped()
  async current(@Req() request: FastifyRequest) {
    return getTenant(this.db, request.tenant!.tenantId);
  }
}
