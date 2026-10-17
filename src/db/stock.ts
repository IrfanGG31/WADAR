import "server-only";
import { cache } from "react";
import { daysWithRows, mergeDailyRows, planDailySource } from "@/core/daily-source";
import { addDays, daysOf, lastDays } from "@/core/period";
import { forecastStock, type StockDailyRow } from "@/core/stock";
import { itemTitle, toForecastRow, type ForecastRow, type StockItem } from "@/core/stock-insight";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";
import { rollupRowsOrEmpty, shopTodayById } from "./rollup-read";

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
 * from `stock_daily_rollup` for closed days that were rolled up and from
 * `stock_daily_series` for the rest (today, days not rolled up yet) — 56 days
 * × variant, paged: well over PostgREST's 1000-row cap for a 30-product shop.
 * Both give the same opening/sold for a closed day. The numbers come only
 * from {@link forecastStock}; the screens never re-derive them. Cached per
 * request: Beranda's low-stock list and insight card share one load.
 */
export const listStockForecasts = cache(async (tenantId: string, db?: SupabaseClient): Promise<ForecastRow[]> => {
  const supabase = db ?? (await createClient());

  // The shop's date is unknown until its row is read, so the rollup query takes
  // a little more than 56 days around UTC today; rows are cut to the window below.
  const utcToday = new Date().toISOString().slice(0, 10);
  const [variants, today, rollup] = await Promise.all([
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
    shopTodayById(supabase, tenantId),
    rollupRowsOrEmpty("stock_daily_rollup", () =>
      fetchAllRows<SeriesDbRow>((from, to) =>
        supabase
          .from("stock_daily_rollup")
          .select("variant_id, day, opening, sold")
          .eq("tenant_id", tenantId)
          .gte("day", addDays(utcToday, -(STOCK_HISTORY_DAYS + 1)))
          .lte("day", addDays(utcToday, 1))
          .order("variant_id")
          .order("day")
          .range(from, to),
      ),
    ),
  ]);

  const series = await stockSeries(supabase, tenantId, today, rollup);
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

/**
 * 56 days × variant: rolled-up closed days from `stock_daily_rollup`, the
 * rest from `stock_daily_series`. The RPC only takes "last N days", so it is
 * asked for the days from the earliest one not rolled up through today.
 */
async function stockSeries(
  supabase: SupabaseClient,
  tenantId: string,
  today: string | null,
  rollup: SeriesDbRow[],
): Promise<SeriesDbRow[]> {
  const live = (days: number) =>
    fetchAllRows<SeriesDbRow>((from, to) =>
      supabase
        .rpc("stock_daily_series", { p_tenant_id: tenantId, p_days: days })
        .order("variant_id")
        .order("day")
        .range(from, to),
    );
  if (!today) return live(STOCK_HISTORY_DAYS);

  const window = lastDays(today, STOCK_HISTORY_DAYS);
  const plan = planDailySource(window, today, daysWithRows(rollup));
  const liveRows = plan.live.length > 0 ? await live(daysOf({ from: plan.live[0].from, to: today }).length) : [];
  return mergeDailyRows(plan, window, rollup, liveRows).sort(
    (a, b) => (a.variant_id < b.variant_id ? -1 : a.variant_id > b.variant_id ? 1 : a.day < b.day ? -1 : a.day > b.day ? 1 : 0),
  );
}

interface ExpiryDbRow {
  id: string;
  on_hand: number;
  option_label: string | null;
  expires_on: string;
  products: { name: string; unit: string } | null;
}

export interface ExpiryVariant {
  variant_id: string;
  title: string;
  unit: string;
  on_hand: number;
  expires_on: string;
}

/**
 * Active variants that carry an expiry date (STK-5) plus the shop's date.
 * Read on its own so the Stok screens keep working before migration
 * 20261017190000_variant_expiry is applied: a failed read = no warnings.
 */
export async function listExpiryVariants(tenantId: string): Promise<{ today: string | null; variants: ExpiryVariant[] }> {
  const supabase = await createClient();
  const [today, result] = await Promise.all([
    shopTodayById(supabase, tenantId),
    supabase
      .from("variants")
      .select("id, on_hand, option_label, expires_on, products:products!inner(name, unit, is_active, deleted_at)")
      .eq("tenant_id", tenantId)
      .not("expires_on", "is", null)
      .gt("on_hand", 0)
      .is("products.deleted_at", null)
      .eq("products.is_active", true)
      .order("expires_on")
      .limit(500),
  ]);
  if (result.error) return { today, variants: [] };
  const rows = (result.data ?? []) as unknown as ExpiryDbRow[];
  return {
    today,
    variants: rows.map((r) => ({
      variant_id: r.id,
      title: itemTitle({ product_name: r.products?.name ?? "Produk", option_label: r.option_label }),
      unit: r.products?.unit ?? "pcs",
      on_hand: Number(r.on_hand),
      expires_on: r.expires_on,
    })),
  };
}

/** Expiry date per variant id for the product edit form; empty before the migration is applied. */
export async function getVariantExpiries(tenantId: string, variantIds: string[]): Promise<Record<string, string | null>> {
  if (variantIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from("variants").select("id, expires_on").eq("tenant_id", tenantId).in("id", variantIds);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { id: string; expires_on: string | null }[]).map((r) => [r.id, r.expires_on]));
}
