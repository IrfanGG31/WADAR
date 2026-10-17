import "server-only";
import { cache } from "react";
import { forecastStock, type StockDailyRow } from "@/core/stock";
import { toForecastRow, type ForecastRow, type StockItem } from "@/core/stock-insight";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";

/** Days of history fed to forecastStock (TECH-SPEC §7.1: 56 days, 28 valid days used). */
export const STOCK_HISTORY_DAYS = 56;

interface VariantDbRow {
  id: string;
  product_id: string;
  on_hand: number;
  avg_cost: number;
  cost_is_set: boolean;
  min_stock: number;
  lead_time_days: number;
  pack_size: number;
  option_label: string | null;
  products: { name: string; unit: string; category: string | null } | null;
}

interface SeriesDbRow {
  variant_id: string;
  day: string;
  opening: number;
  sold: number;
}

/**
 * Every active variant with its Stock Intelligence forecast. History comes
 * from `stock_daily_series` (56 days × variant — paged, it is well over
 * PostgREST's 1000-row cap for a 30-product shop) and the numbers come only
 * from {@link forecastStock}; the screens never re-derive them. Cached per
 * request: Beranda's low-stock list and insight card share one load.
 */
export const listStockForecasts = cache(async (tenantId: string, db?: SupabaseClient): Promise<ForecastRow[]> => {
  const supabase = db ?? (await createClient());

  const [variants, series] = await Promise.all([
    fetchAllRows<VariantDbRow>((from, to) =>
      supabase
        .from("variants")
        .select(
          "id, product_id, on_hand, avg_cost, cost_is_set, min_stock, lead_time_days, pack_size, option_label, " +
            "products:products!inner(name, unit, category, is_active, deleted_at)",
        )
        .eq("tenant_id", tenantId)
        .is("products.deleted_at", null)
        .eq("products.is_active", true)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<SeriesDbRow>((from, to) =>
      supabase
        .rpc("stock_daily_series", { p_tenant_id: tenantId, p_days: STOCK_HISTORY_DAYS })
        .order("variant_id")
        .order("day")
        .range(from, to),
    ),
  ]);

  const history = new Map<string, StockDailyRow[]>();
  for (const r of series) {
    const list = history.get(r.variant_id) ?? [];
    list.push({ day: r.day, opening: Number(r.opening), sold: Number(r.sold) });
    history.set(r.variant_id, list);
  }

  return variants.map((v) => {
    const item: StockItem = {
      variant_id: v.id,
      product_id: v.product_id,
      product_name: v.products?.name ?? "Produk",
      option_label: v.option_label,
      category: v.products?.category ?? null,
      unit: v.products?.unit ?? "pcs",
      on_hand: Number(v.on_hand),
      avg_cost: Number(v.avg_cost),
      cost_is_set: v.cost_is_set,
      min_stock: Number(v.min_stock),
      lead_time_days: Number(v.lead_time_days),
      pack_size: Number(v.pack_size),
    };
    const forecast = forecastStock({
      on_hand: item.on_hand,
      avg_cost: item.avg_cost,
      min_stock: item.min_stock,
      lead_time_days: item.lead_time_days,
      pack_size: item.pack_size,
      daily: history.get(v.id) ?? [],
    });
    return toForecastRow(item, forecast);
  });
});
