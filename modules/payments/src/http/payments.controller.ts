import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { CreateQrisIntentBody } from "@wadar/contracts";
import { Permission, PermissionGuard, RequirePermission, SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, problem, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { PaymentsError, createQrisIntent, simulateIntentPaid } from "../application/commands.js";
import { getIntent, listIncomingPayments } from "../application/queries.js";
import type { PaymentProvider } from "../infra/provider.js";
import { PAYMENT_PROVIDER } from "./tokens.js";

function toHttp(error: unknown): never {
  if (error instanceof PaymentsError) throw problem(error.status, error.code, error.message);
  throw error;
}

@Controller("v1/payments")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class PaymentsController {
  constructor(
    @Inject(PLATFORM_DB) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Post("qris")
  @TenantScoped()
  @RequirePermission(Permission.CashierOperate)
  @UseInterceptors(IdempotencyKeyInterceptor)
  createQris(@Body(new ZodValidationPipe(CreateQrisIntentBody)) body: CreateQrisIntentBody, @Req() request: FastifyRequest) {
    return createQrisIntent(this.db, this.provider, { tenantId: request.tenant!.tenantId, actorUserId: request.user!.id }, body.orderId).catch(toHttp);
  }

  /** Polling fallback when the realtime stream is down (ARCHITECTURE §8). */
  @Get("intents/:id")
  @TenantScoped()
  @RequirePermission(Permission.CashierOperate)
  async intent(@Req() request: FastifyRequest, @Param("id", ParseUUIDPipe) id: string) {
    const intent = await getIntent(this.db, request.tenant!.tenantId, id);
    if (!intent) throw problem(404, "INTENT_NOT_FOUND", "QRIS tidak ditemukan.");
    return intent;
  }

  @Post("intents/:id/simulate-paid")
  @HttpCode(200)
  @TenantScoped()
  @RequirePermission(Permission.CashierOperate)
  async simulate(@Req() request: FastifyRequest, @Param("id", ParseUUIDPipe) id: string) {
    if (this.provider.name !== "simulator") throw problem(404, "NOT_AVAILABLE", "Simulasi hanya tersedia di mode uji.");
    return { result: await simulateIntentPaid(this.db, request.tenant!.tenantId, id).catch(toHttp) };
  }

  @Get("incoming")
  @TenantScoped()
  @RequirePermission(Permission.CashierOperate)
  incoming(@Req() request: FastifyRequest, @Query("limit") limit?: string) {
    return listIncomingPayments(this.db, request.tenant!.tenantId, Math.min(Math.max(Number(limit) || 10, 1), 50));
  }
}
