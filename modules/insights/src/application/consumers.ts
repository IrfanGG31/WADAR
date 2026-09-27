import { FinanceEntryPostedV1, InventoryStockLowV1, SalesOrderCompletedV1, SalesOrderVoidedV1 } from "@wadar/contracts";
import { localDateKey } from "@wadar/core";
import { getTenantTimezone } from "@wadar/identity";
import type { EventBus, EventMeta, Tx } from "@wadar/platform";
import { getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { stockAlertTitle } from "../domain/sentences.js";
import { alerts, dailyCashflowAgg, dailyChannelAgg, dailyExpenseAgg, dailyProductAgg, dailySalesAgg, walletBalances } from "../db/schema.js";

export const INSIGHTS_CONSUMER = "insights";

/** `<table>.<column> + n` — qualified, since in ON CONFLICT DO UPDATE a bare name is ambiguous with EXCLUDED. */
const add = (column: AnyPgColumn, amount: number) =>
  sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)} + ${amount}`;

async function applyOrder(tx: Tx, tenantId: string, event: SalesOrderCompletedV1 | SalesOrderVoidedV1, sign: 1 | -1) {
  const timezone = await getTenantTimezone(tx, tenantId);
  // A void corrects the original sale's day (the same rule finance uses for P&L).
  const day = localDateKey(event.completedAt, timezone);
  const t = event.totals;
  await tx
    .insert(dailySalesAgg)
    .values({ tenantId, outletId: event.outletId, day, orders: sign, gross: sign * t.gross, discount: sign * t.discount, net: sign * t.net, cost: sign * t.cost, commission: sign * t.commission })
    .onConflictDoUpdate({
      target: [dailySalesAgg.tenantId, dailySalesAgg.outletId, dailySalesAgg.day],
      set: {
        orders: add(dailySalesAgg.orders, sign),
        gross: add(dailySalesAgg.gross, sign * t.gross),
        discount: add(dailySalesAgg.discount, sign * t.discount),
        net: add(dailySalesAgg.net, sign * t.net),
        cost: add(dailySalesAgg.cost, sign * t.cost),
        commission: add(dailySalesAgg.commission, sign * t.commission),
      },
    });
  await tx
    .insert(dailyChannelAgg)
    .values({ tenantId, day, channel: event.channel, orders: sign, net: sign * t.net, cost: sign * t.cost, commission: sign * t.commission })
    .onConflictDoUpdate({
      target: [dailyChannelAgg.tenantId, dailyChannelAgg.day, dailyChannelAgg.channel],
      set: {
        orders: add(dailyChannelAgg.orders, sign),
        net: add(dailyChannelAgg.net, sign * t.net),
        cost: add(dailyChannelAgg.cost, sign * t.cost),
        commission: add(dailyChannelAgg.commission, sign * t.commission),
      },
    });
  for (const line of event.lines) {
    const cost = line.qty * line.unitCost;
    const withoutCost = line.unitCost === 0 ? line.qty : 0;
    await tx
      .insert(dailyProductAgg)
      .values({
        tenantId,
        day,
        variantId: line.variantId,
        productId: line.productId,
        name: line.name,
        qty: sign * line.qty,
        net: sign * line.netAmount,
        cost: sign * cost,
        commission: sign * line.commission,
        qtyWithoutCost: sign * withoutCost,
      })
      .onConflictDoUpdate({
        target: [dailyProductAgg.tenantId, dailyProductAgg.day, dailyProductAgg.variantId],
        set: {
          name: line.name,
          qty: add(dailyProductAgg.qty, sign * line.qty),
          net: add(dailyProductAgg.net, sign * line.netAmount),
          cost: add(dailyProductAgg.cost, sign * cost),
          commission: add(dailyProductAgg.commission, sign * line.commission),
          qtyWithoutCost: add(dailyProductAgg.qtyWithoutCost, sign * withoutCost),
        },
      });
  }
}

async function onEntryPosted(tx: Tx, payload: unknown, tenantId: string): Promise<void> {
  const event = FinanceEntryPostedV1.parse(payload);
  const timezone = await getTenantTimezone(tx, tenantId);
  // Money moves on the day it moved; profit items land on the business day
  // (a void's reversal counts against the original sale's day).
  const cashDay = localDateKey(event.occurredAt, timezone);
  const pnlDay = localDateKey(event.reversalOfOccurredAt ?? event.occurredAt, timezone);
  const totals = { moneyIn: 0, moneyOut: 0, sales: 0, discounts: 0, cogs: 0, commission: 0, expenses: 0, otherIncome: 0 };
  const expenseByCategory = new Map<string, number>();
  for (const line of event.lines) {
    const debitMinusCredit = line.debit - line.credit;
    switch (line.kind) {
      case "wallet":
        if (event.cashflow) {
          totals.moneyIn += line.debit;
          totals.moneyOut += line.credit;
        }
        if (line.walletId) {
          await tx
            .insert(walletBalances)
            .values({ tenantId, walletId: line.walletId, balance: debitMinusCredit })
            .onConflictDoUpdate({ target: [walletBalances.tenantId, walletBalances.walletId], set: { balance: add(walletBalances.balance, debitMinusCredit) } });
        }
        break;
      case "revenue":
        totals.sales -= debitMinusCredit;
        break;
      case "contra_revenue":
        totals.discounts += debitMinusCredit;
        break;
      case "cogs":
        totals.cogs += debitMinusCredit;
        break;
      case "commission":
        totals.commission += debitMinusCredit;
        break;
      case "expense":
        totals.expenses += debitMinusCredit;
        expenseByCategory.set(line.accountCode, (expenseByCategory.get(line.accountCode) ?? 0) + debitMinusCredit);
        break;
      case "other_income":
        totals.otherIncome -= debitMinusCredit;
        break;
      default:
        break;
    }
  }
  const upsertCashflow = async (day: string, values: Partial<typeof totals>) => {
    if (Object.values(values).every((v) => v === 0)) return;
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const column = dailyCashflowAgg[key as keyof typeof totals];
      set[key] = add(column, value);
    }
    await tx
      .insert(dailyCashflowAgg)
      .values({ tenantId, day, ...values })
      .onConflictDoUpdate({ target: [dailyCashflowAgg.tenantId, dailyCashflowAgg.day], set });
  };
  await upsertCashflow(cashDay, { moneyIn: totals.moneyIn, moneyOut: totals.moneyOut });
  await upsertCashflow(pnlDay, {
    sales: totals.sales,
    discounts: totals.discounts,
    cogs: totals.cogs,
    commission: totals.commission,
    expenses: totals.expenses,
    otherIncome: totals.otherIncome,
  });
  for (const [category, amount] of expenseByCategory) {
    await tx
      .insert(dailyExpenseAgg)
      .values({ tenantId, day: pnlDay, category, amount })
      .onConflictDoUpdate({ target: [dailyExpenseAgg.tenantId, dailyExpenseAgg.day, dailyExpenseAgg.category], set: { amount: add(dailyExpenseAgg.amount, amount) } });
  }
}

async function onStockAlert(tx: Tx, payload: unknown, tenantId: string, meta: EventMeta): Promise<void> {
  const event = InventoryStockLowV1.partial({ productName: true }).parse(payload);
  const timezone = await getTenantTimezone(tx, tenantId);
  const day = localDateKey(new Date(), timezone);
  const name = event.productName ?? "Produk";
  await tx
    .insert(alerts)
    .values({
      id: uuidv7(),
      tenantId,
      type: meta.eventType === "inventory.stock.out" ? "stock_out" : "stock_low",
      dedupeKey: `stock:${event.outletId}:${event.variantId}:${day}`,
      severity: meta.eventType === "inventory.stock.out" ? "critical" : "warning",
      title: stockAlertTitle(name, event.onHand, event.daysLeft),
      body: "Pertimbangkan pesan ulang ke supplier.",
      data: event,
    })
    .onConflictDoNothing();
}

export function registerInsightsConsumers(eventBus: EventBus): void {
  eventBus.registerHandler("sales.order.completed", INSIGHTS_CONSUMER, (tx, payload, tenantId) =>
    applyOrder(tx, tenantId, SalesOrderCompletedV1.parse(payload), 1),
  );
  eventBus.registerHandler("sales.order.voided", INSIGHTS_CONSUMER, (tx, payload, tenantId) =>
    applyOrder(tx, tenantId, SalesOrderVoidedV1.parse(payload), -1),
  );
  eventBus.registerHandler("finance.entry.posted", INSIGHTS_CONSUMER, onEntryPosted);
  eventBus.registerHandler("inventory.stock.low", INSIGHTS_CONSUMER, onStockAlert);
  eventBus.registerHandler("inventory.stock.out", INSIGHTS_CONSUMER, onStockAlert);
}
