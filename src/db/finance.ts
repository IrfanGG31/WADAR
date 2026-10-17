import "server-only";
import { cache } from "react";
import {
  lineFromFinDaily,
  type ExpenseEntry,
  type FinDailyRow,
  type FinLine,
  type VariantLabel,
} from "@/core/finance-insight";
import { daysWithRows, mergeDailyRows, planDailySource } from "@/core/daily-source";
import type { PeriodWindow } from "@/core/period";
import { itemTitle } from "@/core/stock-insight";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";
import { rollupRowsOrEmpty, shopTodayById } from "./rollup-read";

export interface FinanceData {
  lines: FinLine[];
  expenses: ExpenseEntry[];
}

interface VariantNameRow {
  id: string;
  option_label: string | null;
  products: { name: string; category: string | null } | null;
}

const FIN_COLUMNS =
  "day, variant_id, channel_id, q, revenue_gross, line_discount, order_discount_alloc, cost, " +
  "platform_fee_alloc, shipping_subsidy_alloc, cost_is_set";

/** `fin_daily` and `fin_daily_rollup` have the same columns; same order as before so pages see the same rows. */
function finRows(db: SupabaseClient, table: "fin_daily" | "fin_daily_rollup", tenantId: string, window: PeriodWindow) {
  return fetchAllRows<FinDailyRow>((from, to) =>
    db
      .from(table)
      .select(FIN_COLUMNS)
      .eq("tenant_id", tenantId)
      .gte("day", window.from)
      .lte("day", window.to)
      .order("day")
      .order("variant_id")
      .order("channel_id")
      .range(from, to),
  );
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The live query's ORDER BY (lower-case uuid text sorts like Postgres' uuid order). */
function byDayVariantChannel(a: FinDailyRow, b: FinDailyRow): number {
  return cmp(a.day, b.day) || cmp(a.variant_id, b.variant_id) || cmp(a.channel_id, b.channel_id);
}

/**
 * Keuangan input for one window: `fin_daily` rows (day × variant × channel,
 * TECH-SPEC §7.2 — the dashboard reads aggregates, not sale lines; closed days
 * that were rolled up come from `fin_daily_rollup`, see core/daily-source) labelled
 * with product title / category / channel name, plus expenses by day. All
 * arithmetic happens afterwards in src/core/finance*.ts.
 */
export function getFinanceData(tenantId: string, window: PeriodWindow, db?: SupabaseClient): Promise<FinanceData> {
  return loadFinanceData(tenantId, window.from, window.to, db);
}

/** Keyed by primitives so React's per-request cache can dedupe identical windows. */
const loadFinanceData = cache(async (tenantId: string, fromDay: string, toDay: string, db?: SupabaseClient): Promise<FinanceData> => {
  const window = { from: fromDay, to: toDay };
  const supabase = db ?? (await createClient());

  const [today, rollup, variants, channels, expenses] = await Promise.all([
    shopTodayById(supabase, tenantId),
    rollupRowsOrEmpty("fin_daily_rollup", () => finRows(supabase, "fin_daily_rollup", tenantId, window)),
    // Archived products stay in history, so no deleted_at filter here.
    fetchAllRows<VariantNameRow>((from, to) =>
      supabase
        .from("variants")
        .select("id, option_label, products(name, category)")
        .eq("tenant_id", tenantId)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<{ id: string; name: string }>((from, to) =>
      supabase.from("channels").select("id, name").eq("tenant_id", tenantId).order("id").range(from, to),
    ),
    fetchAllRows<{ occurred_at: string; amount: number }>((from, to) =>
      supabase
        .from("expenses")
        .select("id, occurred_at, amount")
        .eq("tenant_id", tenantId)
        .gte("occurred_at", window.from)
        .lte("occurred_at", window.to)
        .order("occurred_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  // Without the shop's date nothing counts as closed: the live view answers every day.
  const plan = planDailySource(window, today ?? window.from, today ? daysWithRows(rollup) : new Set());
  const live = (await Promise.all(plan.live.map((w) => finRows(supabase, "fin_daily", tenantId, w)))).flat();
  const rows = mergeDailyRows(plan, window, rollup, live).sort(byDayVariantChannel);

  const variantLabels = new Map<string, VariantLabel>(
    variants.map((v) => [
      v.id,
      {
        title: itemTitle({ product_name: v.products?.name ?? "Produk", option_label: v.option_label }),
        category: v.products?.category ?? null,
      },
    ]),
  );
  const channelNames = new Map(channels.map((c) => [c.id, c.name]));

  return {
    lines: rows.map((r) =>
      lineFromFinDaily(
        {
          day: r.day,
          variant_id: r.variant_id,
          channel_id: r.channel_id,
          q: Number(r.q),
          revenue_gross: Number(r.revenue_gross),
          line_discount: Number(r.line_discount),
          order_discount_alloc: Number(r.order_discount_alloc),
          cost: Number(r.cost),
          platform_fee_alloc: Number(r.platform_fee_alloc),
          shipping_subsidy_alloc: Number(r.shipping_subsidy_alloc),
          cost_is_set: Boolean(r.cost_is_set),
        },
        variantLabels,
        channelNames,
      ),
    ),
    expenses: expenses.map((e) => ({ day: e.occurred_at, amount: Number(e.amount) })),
  };
});
