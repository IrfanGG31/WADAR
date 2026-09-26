import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { CompleteOrderBody, SalesChannel, SetChannelCommissionBody, VoidOrderBody } from "@wadar/contracts";
import { Permission, PermissionGuard, RequirePermission, SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, problem, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { SalesError, completeOrder, setChannelCommission, voidOrder, type SalesContext } from "../application/commands.js";
import { getChannelSettings, getOrder, getPublicReceipt, listOrders } from "../application/queries.js";
import { SALES_OPTIONS, type SalesModuleOptions } from "./tokens.js";

function toHttp(error: unknown): never {
  if (error instanceof SalesError) throw problem(error.status, error.code, error.message);
  throw error;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

@Controller("v1")
export class OrdersController {
  constructor(
    @Inject(PLATFORM_DB) private readonly db: Db,
    @Inject(SALES_OPTIONS) private readonly options: SalesModuleOptions,
  ) {}

  private ctx(request: FastifyRequest, correlationId: string | undefined): SalesContext {
    const permissions = request.tenant!.permissions;
    return {
      tenantId: request.tenant!.tenantId,
      actorUserId: request.user!.id,
      correlationId: correlationId ?? randomUUID(),
      includeCost: permissions.includes(Permission.FinanceView),
      receiptSecret: this.options.receiptSecret,
    };
  }

  @Post("orders")
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.CashierOperate)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async complete(
    @Body(new ZodValidationPipe(CompleteOrderBody)) body: CompleteOrderBody,
    @Req() request: FastifyRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return completeOrder(this.db, { ...this.ctx(request, correlationId), idempotencyKey }, body).catch(toHttp);
  }

  @Get("orders")
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.OrdersManage)
  async list(
    @Req() request: FastifyRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("channel") channel?: string,
    @Query("outletId") outletId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedChannel = channel ? SalesChannel.safeParse(channel) : undefined;
    return listOrders(this.db, request.tenant!.tenantId, {
      from: parseDate(from),
      to: parseDate(to),
      channel: parsedChannel?.success ? parsedChannel.data : undefined,
      outletId: outletId && /^[0-9a-f-]{36}$/i.test(outletId) ? outletId : undefined,
      cursor,
      limit: Math.min(Math.max(Number(limit) || 30, 1), 100),
    });
  }

  @Get("orders/:id")
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.OrdersManage)
  async get(@Req() request: FastifyRequest, @Param("id", ParseUUIDPipe) id: string) {
    const order = await getOrder(this.db, request.tenant!.tenantId, id, this.ctx(request, undefined));
    if (!order) throw problem(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
    return order;
  }

  @Post("orders/:id/void")
  @HttpCode(200)
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.OrdersVoid)
  async void(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(VoidOrderBody)) body: VoidOrderBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return voidOrder(this.db, this.ctx(request, correlationId), id, body.reason).catch(toHttp);
  }

  @Get("sales/channels")
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  async channels(@Req() request: FastifyRequest) {
    return getChannelSettings(this.db, request.tenant!.tenantId);
  }

  @Put("sales/channels")
  @UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
  @TenantScoped()
  @RequirePermission(Permission.SettingsManage)
  async setChannel(
    @Body(new ZodValidationPipe(SetChannelCommissionBody)) body: SetChannelCommissionBody,
    @Req() request: FastifyRequest,
  ) {
    await setChannelCommission(this.db, { tenantId: request.tenant!.tenantId, actorUserId: request.user!.id }, body);
    return { status: "ok" };
  }

  /** Public digital receipt (PRD O2.3) — no auth; the signed token authorizes exactly one order. */
  @Get("public/receipts/:token")
  async receipt(@Param("token") token: string) {
    if (token.length > 300) throw problem(404, "RECEIPT_NOT_FOUND", "Struk tidak ditemukan.");
    const receipt = await getPublicReceipt(this.db, this.options.receiptSecret, token);
    if (!receipt) throw problem(404, "RECEIPT_NOT_FOUND", "Struk tidak ditemukan.");
    return receipt;
  }
}
