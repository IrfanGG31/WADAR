import { Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { CatalogPhotoUrls } from "@wadar/catalog";
import { AdjustStockBody } from "@wadar/contracts";
import { Permission, PermissionGuard, RequirePermission, SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, problem, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InventoryError, adjustStock } from "../application/commands.js";
import { stockOverview, variantMovements } from "../application/queries.js";

const OutletQuery = z.uuid({ message: "outletId wajib diisi" });

function canSeeCost(request: FastifyRequest): boolean {
  const permissions = request.tenant?.permissions ?? [];
  return permissions.includes(Permission.CatalogManage) || permissions.includes(Permission.FinanceView);
}

@Controller("v1/stock")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class StockController {
  constructor(
    @Inject(PLATFORM_DB) private readonly db: Db,
    private readonly photos: CatalogPhotoUrls,
  ) {}

  @Get()
  @TenantScoped()
  async overview(@Req() request: FastifyRequest, @Query("outletId") outletId?: string, @Query("search") search?: string) {
    const parsedOutlet = OutletQuery.safeParse(outletId);
    if (!parsedOutlet.success) throw problem(400, "OUTLET_REQUIRED", "Pilih outlet dulu.");
    const items = await stockOverview(this.db, request.tenant!.tenantId, parsedOutlet.data, {
      search: search?.trim() || undefined,
      includeCost: canSeeCost(request),
    });
    return this.photos.resolve(items);
  }

  @Get("variants/:variantId/movements")
  @TenantScoped()
  async movements(
    @Req() request: FastifyRequest,
    @Param("variantId", ParseUUIDPipe) variantId: string,
    @Query("outletId") outletId?: string,
  ) {
    const parsedOutlet = outletId ? OutletQuery.safeParse(outletId) : undefined;
    if (parsedOutlet && !parsedOutlet.success) throw problem(400, "INVALID_OUTLET", "Outlet tidak valid.");
    return variantMovements(this.db, request.tenant!.tenantId, variantId, parsedOutlet?.data, canSeeCost(request));
  }

  @Post("adjustments")
  @TenantScoped()
  @RequirePermission(Permission.InventoryManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async adjust(
    @Body(new ZodValidationPipe(AdjustStockBody)) body: AdjustStockBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    try {
      return await adjustStock(
        this.db,
        { tenantId: request.tenant!.tenantId, actorUserId: request.user!.id, correlationId: correlationId ?? randomUUID() },
        body,
      );
    } catch (error) {
      if (error instanceof InventoryError) {
        throw problem(error.code === "NO_CHANGE" ? 422 : 404, error.code, error.message);
      }
      throw error;
    }
  }
}
