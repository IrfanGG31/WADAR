import { getCatalogQualitySummary } from "@wadar/catalog";
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory, type FeedItem, type HomeView, type ProfitBreakdown, type SummaryView } from "@wadar/contracts";
import { addDays, localDateKey } from "@wadar/core";
import { getTenantTimezone } from "@wadar/identity";
import { listStockAlerts } from "@wadar/inventory";
import { withTenantContext, type Db, type Tx } from "@wadar/platform";
import { and, between, desc, eq, isNull, sql } from "drizzle-orm";
import { balanceSentence, moneyInSentence, profitSentence, stockAlertTitle, trendOf } from "../domain/sentences.js";
import { alerts, dailyCashflowAgg, dailyChannelAgg, dailyExpenseAgg, dailyProductAgg, walletBalances } from "../db/schema.js";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

interface CashflowTotals {
  moneyIn: number;
  moneyOut: number;
  sales: number;
  discounts: number;
  cogs: number;
  commission: number;
  expenses: number;
  otherIncome: number;
}

function profitOf(t: CashflowTotals): number {
  return t.sales - t.discounts - t.cogs - t.commission - t.expenses + t.otherIncome;
}

async function cashflowByDay(tx: Tx, tenantId: string, from: string, to: string): Promise<Map<string, CashflowTotals>> {
  const rows = await tx
    .select()
    .from(dailyCashflowAgg)
    .where(and(eq(dailyCashflowAgg.tenantId, tenantId), between(dailyCashflowAgg.day, from, to)));
  return new Map(rows.map((r) => [r.day, r]));
}

function sumTotals(values: Iterable<CashflowTotals>): CashflowTotals {
  const total: CashflowTotals = { moneyIn: 0, moneyOut: 0, sales: 0, discounts: 0, cogs: 0, commission: 0, expenses: 0, otherIncome: 0 };
  for (const v of values) for (const key of Object.keys(total) as Array<keyof CashflowTotals>) total[key] += v[key];
  return total;
}

const EMPTY: CashflowTotals = sumTotals([]);

function catalogAndStockFeed(
  quality: Awaited<ReturnType<typeof getCatalogQualitySummary>>,
  stockAlerts: Awaited<ReturnType<typeof listStockAlerts>>,
): FeedItem[] {
  const feed: FeedItem[] = [];
  if (quality.activeProducts === 0) {
    feed.push({
      id: "getting-started",
      kind: "getting_started",
      severity: "info",
      title: "Tambah produk pertamamu",
      body: "Setelah ada produk, kamu bisa jualan di Kasir dan untung dihitung otomatis.",
      href: "/stok/baru",
      actionLabel: "Tambah produk",
    });
  }
  for (const item of stockAlerts.slice(0, 5)) {
    feed.push({
      id: `stock:${item.variantId}`,
      kind: "stock",
      severity: item.onHand <= 0 || (item.daysLeft ?? 99) <= 3 ? "critical" : "warning",
      title: stockAlertTitle(item.name, item.onHand, item.daysLeft),
      body:
        item.onHand < 0
          ? "Stok di sistem minus — cek stok fisik lalu sesuaikan."
          : item.reorderQty > 0
            ? `Sisa ${item.onHand}. Saran pesan ulang ±${item.reorderQty} supaya cukup 2 minggu.`
            : `Sisa ${item.onHand}.`,
      href: `/stok/${item.productId}`,
      actionLabel: "Lihat stok",
    });
  }
  if (quality.missing.cost > 0) {
    feed.push({
      id: "quality:cost",
      kind: "catalog_quality",
      severity: "warning",
      title: `${quality.missing.cost} produk belum ada modal (HPP)`,
      body: "Untung per produk belum akurat sampai modalnya diisi.",
      href: "/stok?filter=belum-lengkap",
      actionLabel: "Lengkapi HPP",
    });
  }
  if (quality.missing.price > 0) {
    feed.push({
      id: "quality:price",
      kind: "catalog_quality",
      severity: "warning",
      title: `${quality.missing.price} produk harganya masih Rp0`,
      body: "Produk ini akan terjual gratis di Kasir.",
      href: "/stok?filter=belum-lengkap",
      actionLabel: "Isi harga",
    });
  }
  if (quality.missing.photo > 0 && quality.activeProducts > 0) {
    feed.push({
      id: "quality:photo",
      kind: "catalog_quality",
      severity: "info",
      title: `${quality.missing.photo} produk belum ada foto`,
      body: "Foto membantu kasir menemukan produk lebih cepat.",
      href: "/stok?filter=belum-lengkap",
      actionLabel: "Tambah foto",
    });
  }
  return feed;
}

async function reconciliationFeed(tx: Tx, tenantId: string): Promise<FeedItem[]> {
  const openReconciliation = await tx
    .select()
    .from(alerts)
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.type, "reconciliation"), isNull(alerts.resolvedAt)))
    .orderBy(desc(alerts.createdAt))
    .limit(1);
  return openReconciliation.map((alert) => ({
    id: alert.id,
    kind: "reconciliation" as const,
    severity: "critical" as const,
    title: alert.title,
    body: alert.body,
    href: "/keuangan",
    actionLabel: "Cek keuangan",
  }));
}

/**
 * Beranda (PRD §8.2, F3.1, F3.8): feed first, then 3 cards, then a 7-day chart.
 *
 * The reads are independent, so they run as four short transactions in
 * parallel on separate pooled connections instead of one after another on a
 * single connection (queries inside one transaction are serialized — every
 * one is a full DB round trip). Each group still runs under the tenant's RLS
 * context; slightly different snapshots are fine for a dashboard.
 */
export async function getHome(db: Db, tenantId: string, outletId: string | undefined, now = new Date()): Promise<HomeView> {
  const [chartData, [balances, reconciliation], quality, stockAlerts] = await Promise.all([
    withTenantContext(db, tenantId, async (tx) => {
      const timezone = await getTenantTimezone(tx, tenantId);
      const today = localDateKey(now, timezone);
      return { today, byDay: await cashflowByDay(tx, tenantId, addDays(today, -6), today) };
    }),
    withTenantContext(db, tenantId, async (tx) =>
      Promise.all([tx.select().from(walletBalances).where(eq(walletBalances.tenantId, tenantId)), reconciliationFeed(tx, tenantId)]),
    ),
    withTenantContext(db, tenantId, (tx) => getCatalogQualitySummary(tx, tenantId)),
    outletId ? withTenantContext(db, tenantId, (tx) => listStockAlerts(tx, tenantId, outletId)) : Promise.resolve([]),
  ]);
  // Same order as a single pass (catalog/stock items, then reconciliation), then by severity — a stable sort.
  const feed = [...catalogAndStockFeed(quality, stockAlerts), ...reconciliation].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const { today, byDay } = chartData;
  const yesterday = addDays(today, -1);
  const firstChartDay = addDays(today, -6);
  const t = byDay.get(today) ?? EMPTY;
  const y = byDay.get(yesterday) ?? EMPTY;
  const profitToday = profitOf(t);
  const profitYesterday = profitOf(y);
  const total = balances.reduce((s, b) => s + b.balance, 0);
  const funded = balances.filter((b) => b.balance !== 0).length;
  return {
    asOf: now.toISOString(),
    today,
    feed,
    cards: {
      moneyIn: { today: t.moneyIn, yesterday: y.moneyIn, sentence: moneyInSentence(t.moneyIn, y.moneyIn), trend: trendOf(t.moneyIn, y.moneyIn) },
      profit: {
        today: profitToday,
        yesterday: profitYesterday,
        sentence: profitSentence(profitToday, t.sales - t.discounts, t.cogs, t.expenses),
        trend: trendOf(profitToday, profitYesterday),
      },
      balance: { total, walletCount: funded, sentence: balanceSentence(total, funded) },
    },
    chart: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(firstChartDay, i);
      const d = byDay.get(day) ?? EMPTY;
      return { day, moneyIn: d.moneyIn, netSales: d.sales - d.discounts, profit: profitOf(d) };
    }),
  };
}

/** Keuangan › Ringkasan from aggregates (never the raw ledger — ARCHITECTURE §5.4). Dates are inclusive local days. */
export async function getSummary(db: Db, tenantId: string, from: string, to: string): Promise<SummaryView> {
  return withTenantContext(db, tenantId, async (tx) => {
    const [byDay, expenseRows] = await Promise.all([
      cashflowByDay(tx, tenantId, from, to),
      tx
        .select({ category: dailyExpenseAgg.category, amount: sql<string>`sum(${dailyExpenseAgg.amount})` })
        .from(dailyExpenseAgg)
        .where(and(eq(dailyExpenseAgg.tenantId, tenantId), between(dailyExpenseAgg.day, from, to)))
        .groupBy(dailyExpenseAgg.category),
    ]);
    const t = sumTotals(byDay.values());
    return {
      from,
      to,
      sales: t.sales,
      discounts: t.discounts,
      netSales: t.sales - t.discounts,
      costOfGoods: t.cogs,
      channelCommission: t.commission,
      expenses: t.expenses,
      expensesByCategory: expenseRows
        .map((r) => ({ category: r.category, label: EXPENSE_CATEGORY_LABEL[r.category as ExpenseCategory] ?? r.category, amount: Number(r.amount) }))
        .filter((r) => r.amount !== 0)
        .sort((a, b) => b.amount - a.amount),
      otherIncome: t.otherIncome,
      netProfit: profitOf(t),
      moneyIn: t.moneyIn,
      moneyOut: t.moneyOut,
    };
  });
}

function marginBps(profit: number, net: number): number | null {
  return net > 0 ? Math.round((profit / net) * 10_000) : null;
}

/** PRD F3.3: untung per produk & per kanal after HPP, discounts and channel commission. */
export async function getProfitBreakdown(db: Db, tenantId: string, from: string, to: string, by: "product" | "channel"): Promise<ProfitBreakdown> {
  return withTenantContext(db, tenantId, async (tx) => {
    if (by === "channel") {
      const rows = await tx
        .select({
          channel: dailyChannelAgg.channel,
          orders: sql<string>`sum(${dailyChannelAgg.orders})`,
          net: sql<string>`sum(${dailyChannelAgg.net})`,
          cost: sql<string>`sum(${dailyChannelAgg.cost})`,
          commission: sql<string>`sum(${dailyChannelAgg.commission})`,
        })
        .from(dailyChannelAgg)
        .where(and(eq(dailyChannelAgg.tenantId, tenantId), between(dailyChannelAgg.day, from, to)))
        .groupBy(dailyChannelAgg.channel);
      return {
        from,
        to,
        by,
        missingCostCount: 0,
        rows: rows
          .map((r) => {
            const [net, cost, commission] = [Number(r.net), Number(r.cost), Number(r.commission)];
            const profit = net - cost - commission;
            return { key: r.channel, name: r.channel, orders: Number(r.orders), netSales: net, cost, commission, profit, marginBps: marginBps(profit, net) };
          })
          .filter((r) => r.orders !== 0 || r.netSales !== 0)
          .sort((a, b) => b.profit - a.profit),
      };
    }
    const rows = await tx
      .select({
        variantId: dailyProductAgg.variantId,
        name: sql<string>`(array_agg(${dailyProductAgg.name} order by ${dailyProductAgg.day} desc))[1]`,
        qty: sql<string>`sum(${dailyProductAgg.qty})`,
        net: sql<string>`sum(${dailyProductAgg.net})`,
        cost: sql<string>`sum(${dailyProductAgg.cost})`,
        commission: sql<string>`sum(${dailyProductAgg.commission})`,
        qtyWithoutCost: sql<string>`sum(${dailyProductAgg.qtyWithoutCost})`,
      })
      .from(dailyProductAgg)
      .where(and(eq(dailyProductAgg.tenantId, tenantId), between(dailyProductAgg.day, from, to)))
      .groupBy(dailyProductAgg.variantId);
    const mapped = rows
      .map((r) => {
        const [net, cost, commission] = [Number(r.net), Number(r.cost), Number(r.commission)];
        const profit = net - cost - commission;
        return {
          key: r.variantId,
          name: r.name,
          qty: Number(r.qty),
          netSales: net,
          cost,
          commission,
          profit,
          marginBps: marginBps(profit, net),
          costMissing: Number(r.qtyWithoutCost) > 0,
        };
      })
      .filter((r) => r.qty !== 0 || r.netSales !== 0)
      .sort((a, b) => b.profit - a.profit);
    return {
      from,
      to,
      by,
      missingCostCount: mapped.filter((r) => r.costMissing).length,
      rows: mapped,
    };
  });
}

/** Trend 7/30/90 days (PRD F3.4). */
export async function getTrend(db: Db, tenantId: string, days: 7 | 30 | 90, now = new Date()) {
  return withTenantContext(db, tenantId, async (tx) => {
    const timezone = await getTenantTimezone(tx, tenantId);
    const today = localDateKey(now, timezone);
    const first = addDays(today, -(days - 1));
    const byDay = await cashflowByDay(tx, tenantId, first, today);
    return Array.from({ length: days }, (_, i) => {
      const day = addDays(first, i);
      const d = byDay.get(day) ?? EMPTY;
      const netSales = d.sales - d.discounts;
      const profit = profitOf(d);
      return { day, moneyIn: d.moneyIn, netSales, profit, marginBps: marginBps(profit, netSales) };
    });
  });
}
