import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { addDays, localDateKey } from "@wadar/core";
import { getTenantTimezone, Permission, PermissionGuard, RequirePermission, SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { PLATFORM_DB, TenantScoped, problem, withTenantContext, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { getHome, getProfitBreakdown, getSummary, getTrend } from "../application/queries.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

@Controller("v1/insights")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class InsightsController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  private async range(tenantId: string, from?: string, to?: string) {
    const timezone = await withTenantContext(this.db, tenantId, (tx) => getTenantTimezone(tx, tenantId));
    const today = localDateKey(new Date(), timezone);
    const f = from && DAY.test(from) ? from : today;
    const t = to && DAY.test(to) ? to : f;
    if (t < f) throw problem(400, "INVALID_RANGE", "Tanggal akhir sebelum tanggal awal.");
    if (addDays(f, 366) < t) throw problem(400, "RANGE_TOO_LONG", "Maksimal 1 tahun sekali lihat.");
    return { from: f, to: t };
  }

  /** Beranda. Money cards need finance access; members without it still get the feed. */
  @Get("home")
  @TenantScoped()
  async home(@Req() request: FastifyRequest, @Query("outletId") outletId?: string) {
    const home = await getHome(this.db, request.tenant!.tenantId, outletId && /^[0-9a-f-]{36}$/i.test(outletId) ? outletId : undefined);
    if (!request.tenant!.permissions.includes(Permission.FinanceView)) {
      return { ...home, cards: null, chart: [] };
    }
    return home;
  }

  @Get("summary")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  async summary(@Req() request: FastifyRequest, @Query("from") from?: string, @Query("to") to?: string) {
    const range = await this.range(request.tenant!.tenantId, from, to);
    return getSummary(this.db, request.tenant!.tenantId, range.from, range.to);
  }

  @Get("profit")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  async profit(@Req() request: FastifyRequest, @Query("from") from?: string, @Query("to") to?: string, @Query("by") by?: string) {
    const range = await this.range(request.tenant!.tenantId, from, to);
    return getProfitBreakdown(this.db, request.tenant!.tenantId, range.from, range.to, by === "channel" ? "channel" : "product");
  }

  @Get("trend")
  @TenantScoped()
  @RequirePermission(Permission.FinanceView)
  trend(@Req() request: FastifyRequest, @Query("days") days?: string) {
    const n = days === "30" ? 30 : days === "90" ? 90 : 7;
    return getTrend(this.db, request.tenant!.tenantId, n);
  }
}
