import "server-only";
import { createClient } from "@/lib/supabase/server";
import { forecastStock, type StockDailyRow, type StockForecast } from "@/core/stock";
import type { StockStatus } from "@/core/stock-level";

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

export interface LowStockRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  option_label: string | null;
  unit: string;
  on_hand: number;
  min_stock: number;
  pack_size: number;
  lead_time_days: number;
  forecast: StockForecast;
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
      day: p.day,
      revenue: Number(p.revenue ?? 0),
      q: Number(p.q ?? 0),
    })),
  };
}

/**
 * Variants running low or forecast to run out — the five most urgent, in that
 * order (habis > kritis > menipis, then shortest days_left). The forecast is
 * computed by {@link forecastStock} from 56 days of history, so the UI never
 * re-derives velocity or ROP on its own.
 */
export async function getLowStock(tenantId: string, limit = 5): Promise<LowStockRow[]> {
  const supabase = await createClient();

  const [{ data: catalog, error: catalogErr }, { data: series, error: seriesErr }] = await Promise.all([
    supabase
      .from("variants")
      .select(
        "id, product_id, on_hand, avg_cost, min_stock, lead_time_days, pack_size, option_label, " +
          "products:products!inner(name, unit, is_active, deleted_at)",
      )
      .eq("tenant_id", tenantId)
      .is("products.deleted_at", null)
      .eq("products.is_active", true),
    supabase.rpc("stock_daily_series", { p_tenant_id: tenantId, p_days: 56 }),
  ]);
  if (catalogErr) throw catalogErr;
  if (seriesErr) throw seriesErr;

  const grouped = new Map<string, StockDailyRow[]>();
  for (const r of (series ?? []) as { variant_id: string; day: string; opening: number; sold: number }[]) {
    const list = grouped.get(r.variant_id) ?? [];
    list.push({ day: r.day, opening: Number(r.opening), sold: Number(r.sold) });
    grouped.set(r.variant_id, list);
  }

  type VariantRow = {
    id: string;
    product_id: string;
    on_hand: number;
    avg_cost: number;
    min_stock: number;
    lead_time_days: number;
    pack_size: number;
    option_label: string | null;
    products: { name: string; unit: string } | null;
  };

  const rows = (catalog ?? []) as unknown as VariantRow[];
  const rank: Record<StockStatus, number> = { habis: 0, kritis: 1, menipis: 2, aman: 3 };

  const scored = rows.map((v) => {
    const forecast = forecastStock({
      on_hand: v.on_hand,
      avg_cost: Number(v.avg_cost),
      min_stock: v.min_stock,
      lead_time_days: v.lead_time_days,
      pack_size: v.pack_size,
      daily: grouped.get(v.id) ?? [],
    });
    return {
      variant_id: v.id,
      product_id: v.product_id,
      product_name: v.products?.name ?? "Produk",
      option_label: v.option_label,
      unit: v.products?.unit ?? "pcs",
      on_hand: v.on_hand,
      min_stock: v.min_stock,
      pack_size: v.pack_size,
      lead_time_days: v.lead_time_days,
      forecast,
    } satisfies LowStockRow;
  });

  return scored
    .filter((r) => r.forecast.status !== "aman")
    .sort(
      (a, b) =>
        rank[a.forecast.status] - rank[b.forecast.status] ||
        a.forecast.days_left - b.forecast.days_left,
    )
    .slice(0, limit);
}
