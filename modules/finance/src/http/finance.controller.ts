import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  CreateWalletBody,
  RecordExpenseBody,
  SetWalletBalanceBody,
  TransferBody,
  UpdateWalletBody,
  VoidExpenseBody,
} from "@wadar/contracts";
import { localDateKey, localDayRange, addDays } from "@wadar/core";
import { getTenantTimezone, Permission, PermissionGuard, RequirePermission, SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, problem, withTenantContext, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import {
  FinanceError,
  createWallet,
  recordExpense,
  setWalletBalance,
  transfer,
  updateWallet,
  voidExpense,
  type FinanceContext,
} from "../application/commands.js";
import { listExpenses, listMoneyMovements, listWallets, profitAndLoss, suggestExpenseCategory } from "../application/queries.js";

function toHttp(error: unknown): never {
  if (error instanceof FinanceError) throw problem(error.status, error.code, error.message);
  throw error;
}

@Controller("v1/finance")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class FinanceController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  private ctx(request: FastifyRequest, correlationId: string | undefined): FinanceContext {
    return { tenantId: request.tenant!.tenantId, actorUserId: request.user!.id, correlationId: correlationId ?? randomUUID() };
  }

  /** `from`/`to` as tenant-local dates (YYYY-MM-DD, `to` inclusive); default = today. */
  private async range(tenantId: string, from?: string, to?: string): Promise<{ from: Date; to: Date }> {
    const timezone = await withTenantContext(this.db, tenantId, (tx) => getTenantTimezone(tx, tenantId));
    const isKey = (v?: string) => v !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const today = localDateKey(new Date(), timezone);
    const fromKey = isKey(from) ? from! : today;
    const toKey = isKey(to) ? to! : fromKey;
    if (toKey < fromKey) throw problem(400, "INVALID_RANGE", "Tanggal akhir sebelum tanggal awal.");
    return { from: localDayRange(fromKey, timezone).start, to: localDayRange(addDays(toKey, 1), timezone).start };
  }

  @Get("wallets")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  wallets(@Req() request: FastifyRequest, @Query("archived") archived?: string) {
    return listWallets(this.db, request.tenant!.tenantId, archived === "1");
  }

  @Post("wallets")
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  createWallet(@Body(new ZodValidationPipe(CreateWalletBody)) body: CreateWalletBody, @Req() request: FastifyRequest, @Headers("x-correlation-id") correlationId?: string) {
    return createWallet(this.db, this.ctx(request, correlationId), body).catch(toHttp);
  }

  @Patch("wallets/:id")
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  async updateWallet(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateWalletBody)) body: UpdateWalletBody,
    @Req() request: FastifyRequest,
  ) {
    await updateWallet(this.db, this.ctx(request, undefined), id, body).catch(toHttp);
    return { status: "ok" };
  }

  @Post("wallets/:id/balance")
  @HttpCode(200)
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  setBalance(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetWalletBalanceBody)) body: SetWalletBalanceBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return setWalletBalance(this.db, this.ctx(request, correlationId), id, body).catch(toHttp);
  }

  @Post("transfers")
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async transfer(@Body(new ZodValidationPipe(TransferBody)) body: TransferBody, @Req() request: FastifyRequest, @Headers("x-correlation-id") correlationId?: string) {
    await transfer(this.db, this.ctx(request, correlationId), body).catch(toHttp);
    return { status: "ok" };
  }

  @Get("expenses")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  async expenses(@Req() request: FastifyRequest, @Query("from") from?: string, @Query("to") to?: string) {
    const range = await this.range(request.tenant!.tenantId, from, to);
    return listExpenses(this.db, request.tenant!.tenantId, range.from, range.to);
  }

  @Post("expenses")
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  recordExpense(@Body(new ZodValidationPipe(RecordExpenseBody)) body: RecordExpenseBody, @Req() request: FastifyRequest, @Headers("x-correlation-id") correlationId?: string) {
    return recordExpense(this.db, this.ctx(request, correlationId), body).catch(toHttp);
  }

  @Post("expenses/:id/void")
  @HttpCode(200)
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  async voidExpense(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(VoidExpenseBody)) body: VoidExpenseBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    await voidExpense(this.db, this.ctx(request, correlationId), id, body.reason).catch(toHttp);
    return { status: "ok" };
  }

  @Get("expense-category-suggestion")
  @TenantScoped()
  @RequirePermission(Permission.FinanceManage)
  suggest(@Req() request: FastifyRequest, @Query("note") note?: string) {
    return suggestExpenseCategory(this.db, request.tenant!.tenantId, (note ?? "").slice(0, 300));
  }

  @Get("profit-and-loss")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  async pnl(@Req() request: FastifyRequest, @Query("from") from?: string, @Query("to") to?: string) {
    const range = await this.range(request.tenant!.tenantId, from, to);
    return profitAndLoss(this.db, request.tenant!.tenantId, range.from, range.to);
  }

  @Get("movements")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  async movements(@Req() request: FastifyRequest, @Query("from") from?: string, @Query("to") to?: string, @Query("walletId") walletId?: string) {
    const range = await this.range(request.tenant!.tenantId, from, to);
    return listMoneyMovements(this.db, request.tenant!.tenantId, {
      ...range,
      walletId: walletId && /^[0-9a-f-]{36}$/i.test(walletId) ? walletId : undefined,
      limit: 200,
    });
  }
}
