import "server-only";
import { createClient } from "@/lib/supabase/server";
import { needsRestock, sortByUrgency, type ForecastRow } from "@/core/stock-insight";
import { listStockForecasts } from "./stock";

export interface TrendPoint {
  day: string; // ISO date
  revenue: number;
  q: number;
}

export interface BerandaSummary {
  today: string;
  revenue_today: number;
  orders_today: number;
  items_today: number;
  new_customers_today: number;
  trend_7d: TrendPoint[];
}

export async function getBerandaSummary(tenantId: string): Promise<BerandaSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("beranda_summary", { p_tenant_id: tenantId });
  if (error) throw error;
  const d = (data ?? {}) as Partial<BerandaSummary>;
  return {
    today: d.today ?? "",
    revenue_today: Number(d.revenue_today ?? 0),
    orders_today: Number(d.orders_today ?? 0),
    items_today: Number(d.items_today ?? 0),
    new_customers_today: Number(d.new_customers_today ?? 0),
    trend_7d: (d.trend_7d ?? []).map((p) => ({
      day: String(p.day).slice(0, 10), // timestamptz → YYYY-MM-DD
      revenue: Number(p.revenue ?? 0),
      q: Number(p.q ?? 0),
    })),
  };
}

/**
 * Variants running low or forecast to run out — the most urgent first
 * (habis > kritis > menipis, then shortest days_left). Forecasts come from
 * {@link listStockForecasts} (src/core/stock.ts), so the UI never re-derives
 * velocity or ROP on its own.
 */
export async function getLowStock(tenantId: string, limit = 5): Promise<ForecastRow[]> {
  const rows = await listStockForecasts(tenantId);
  return sortByUrgency(rows.filter(needsRestock)).slice(0, limit);
}
