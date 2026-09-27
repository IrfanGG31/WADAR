import { z } from "zod";
import { SalesChannel } from "@wadar/contracts/common";

/**
 * Versioned domain event payloads (docs/ARCHITECTURE.md §4.4). Consumers
 * must `.parse()` the payload with the schema for the version they were
 * written against — a producer adding a field is fine, removing/renaming
 * one needs a new version.
 */

const Int = z.number().int();
const Money = z.number().int();

export const CatalogVariantsCreatedV1 = z.object({
  productId: z.uuid(),
  outletId: z.uuid(),
  variants: z.array(
    z.object({
      variantId: z.uuid(),
      name: z.string(),
      price: Money,
      cost: Money.nullable(),
      initialStock: Int,
    }),
  ),
});
export type CatalogVariantsCreatedV1 = z.infer<typeof CatalogVariantsCreatedV1>;

export const CatalogPriceChangedV1 = z.object({
  variantId: z.uuid(),
  productId: z.uuid(),
  oldPrice: Money,
  newPrice: Money,
  oldCost: Money.nullable(),
  newCost: Money.nullable(),
});
export type CatalogPriceChangedV1 = z.infer<typeof CatalogPriceChangedV1>;

export const InventoryStockChangedV1 = z.object({
  variantId: z.uuid(),
  outletId: z.uuid(),
  delta: Int,
  onHand: Int,
  reason: z.string(),
});
export type InventoryStockChangedV1 = z.infer<typeof InventoryStockChangedV1>;

export const InventoryStockLowV1 = z.object({
  variantId: z.uuid(),
  outletId: z.uuid(),
  productName: z.string(),
  onHand: Int,
  /** null for stock.out (already at/below zero). */
  daysLeft: Int.nullable(),
});
export type InventoryStockLowV1 = z.infer<typeof InventoryStockLowV1>;

export const PaymentMethod = z.enum(["cash", "transfer", "qris", "ewallet"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const OrderLineEvent = z.object({
  lineId: z.uuid(),
  variantId: z.uuid(),
  productId: z.uuid(),
  name: z.string(),
  qty: Int,
  unitPrice: Money,
  /** Line discount + allocated share of the order discount. */
  discount: Money,
  /** qty*unitPrice - discount. */
  netAmount: Money,
  /** Snapshot of moving-average HPP per unit at sale time (0 if unknown). */
  unitCost: Money,
  /** Allocated share of the order's channel commission. */
  commission: Money,
});
export type OrderLineEvent = z.infer<typeof OrderLineEvent>;

export const SalesOrderCompletedV1 = z.object({
  orderId: z.uuid(),
  orderNumber: z.string(),
  outletId: z.uuid(),
  channel: SalesChannel,
  completedAt: z.iso.datetime({ offset: true }),
  lines: z.array(OrderLineEvent).min(1),
  totals: z.object({
    gross: Money,
    discount: Money,
    net: Money,
    cost: Money,
    commission: Money,
  }),
  /** Money actually received at checkout (cash/transfer). QRIS is received later via payments. */
  payments: z.array(z.object({ method: PaymentMethod, amount: Money, walletId: z.uuid().nullable() })),
  /** net − Σ payments — owed until a payment arrives (QRIS pending, kasbon). */
  outstanding: Money,
  customerId: z.uuid().nullable(),
});
export type SalesOrderCompletedV1 = z.infer<typeof SalesOrderCompletedV1>;

export const SalesOrderVoidedV1 = z.object({
  orderId: z.uuid(),
  orderNumber: z.string(),
  outletId: z.uuid(),
  channel: SalesChannel,
  voidedAt: z.iso.datetime({ offset: true }),
  /** Original completion time — reversals land on the original business day in aggregates. */
  completedAt: z.iso.datetime({ offset: true }),
  reason: z.string(),
  lines: z.array(OrderLineEvent).min(1),
  totals: SalesOrderCompletedV1.shape.totals,
});
export type SalesOrderVoidedV1 = z.infer<typeof SalesOrderVoidedV1>;

export const SalesOrderPaidV1 = z.object({
  orderId: z.uuid(),
  paymentId: z.uuid(),
  amount: Money,
  method: PaymentMethod,
});
export type SalesOrderPaidV1 = z.infer<typeof SalesOrderPaidV1>;

export const FinanceEntryPostedV1 = z.object({
  entryId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  sourceType: z.string(),
  sourceId: z.string(),
  description: z.string(),
  /** false for moves that aren't real money in/out: wallet transfers, opening balances, balance corrections. */
  cashflow: z.boolean(),
  /** Original business time for reversals (void lands on the sale's day in aggregates). */
  reversalOfOccurredAt: z.iso.datetime({ offset: true }).nullable(),
  lines: z.array(
    z.object({
      accountId: z.uuid(),
      /** Stable account code ("revenue", "exp_rent", "wallet:<id>") — lets insights group expenses by category. */
      accountCode: z.string(),
      /** Account classification used by insights to build cards without querying the ledger. */
      kind: z.enum(["wallet", "receivable", "inventory", "payable", "equity", "revenue", "contra_revenue", "cogs", "commission", "expense", "other_income"]),
      walletId: z.uuid().nullable(),
      debit: Money,
      credit: Money,
    }),
  ),
});
export type FinanceEntryPostedV1 = z.infer<typeof FinanceEntryPostedV1>;

export const FinanceExpenseRecordedV1 = z.object({
  expenseId: z.uuid(),
  amount: Money,
  category: z.string(),
  walletId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type FinanceExpenseRecordedV1 = z.infer<typeof FinanceExpenseRecordedV1>;

export const PaymentsPaymentReceivedV1 = z.object({
  paymentId: z.uuid(),
  intentId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  amount: Money,
  source: z.string(),
  method: PaymentMethod,
  reference: z.string().nullable(),
  receivedAt: z.iso.datetime({ offset: true }),
});
export type PaymentsPaymentReceivedV1 = z.infer<typeof PaymentsPaymentReceivedV1>;

export const PaymentsPaymentExpiredV1 = z.object({
  intentId: z.uuid(),
  orderId: z.uuid().nullable(),
  amount: Money,
});
export type PaymentsPaymentExpiredV1 = z.infer<typeof PaymentsPaymentExpiredV1>;

export const IdentityTenantCreatedV1 = z.object({
  tenantId: z.uuid(),
  outletId: z.uuid(),
  name: z.string(),
});
export type IdentityTenantCreatedV1 = z.infer<typeof IdentityTenantCreatedV1>;
