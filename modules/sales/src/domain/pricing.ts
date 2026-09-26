export interface PricingLineInput {
  variantId: string;
  qty: number;
  unitPrice: number;
  /** Discount for the whole line (not per unit). */
  lineDiscount: number;
  unitCost: number;
}

export interface PricedLine extends PricingLineInput {
  gross: number;
  /** lineDiscount + this line's share of the order discount. */
  discount: number;
  netAmount: number;
  commission: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  gross: number;
  discount: number;
  net: number;
  cost: number;
  commission: number;
}

export class PricingError extends Error {
  constructor(
    readonly code: "LINE_DISCOUNT_TOO_LARGE" | "ORDER_DISCOUNT_TOO_LARGE",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Splits `total` across `weights` proportionally in whole rupiah, handing the
 * leftover rupiah to the largest fractional remainders (ties → earlier
 * line), so the parts always sum to exactly `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || weightSum === 0) return weights.map(() => 0);
  const bigTotal = BigInt(total);
  const bigSum = BigInt(weightSum);
  const floors = weights.map((w) => (bigTotal * BigInt(w)) / bigSum);
  const remainders = weights.map((w, i) => ({ i, r: (bigTotal * BigInt(w)) % bigSum }));
  let leftover = Number(bigTotal - floors.reduce((a, b) => a + b, 0n));
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const result = floors.map(Number);
  for (const { i } of remainders) {
    if (leftover === 0) break;
    result[i]! += 1;
    leftover -= 1;
  }
  return result;
}

/**
 * Prices a cart (PRD O2.1): line discounts, an order discount spread over
 * lines by their post-line-discount value, and the channel commission
 * (basis points of the net) spread the same way — so per-product profit in
 * insights sums back exactly to the order totals.
 */
export function priceOrder(lines: PricingLineInput[], orderDiscount: number, commissionBps: number): PricedOrder {
  const afterLine = lines.map((line) => {
    const gross = line.qty * line.unitPrice;
    if (line.lineDiscount > gross) {
      throw new PricingError("LINE_DISCOUNT_TOO_LARGE", "Diskon barang melebihi harganya.");
    }
    return { line, gross, afterLineDiscount: gross - line.lineDiscount };
  });
  const subtotal = afterLine.reduce((sum, l) => sum + l.afterLineDiscount, 0);
  if (orderDiscount > subtotal) {
    throw new PricingError("ORDER_DISCOUNT_TOO_LARGE", "Diskon melebihi total belanja.");
  }
  const orderDiscountShares = allocate(orderDiscount, afterLine.map((l) => l.afterLineDiscount));
  const nets = afterLine.map((l, i) => l.afterLineDiscount - orderDiscountShares[i]!);
  const net = nets.reduce((a, b) => a + b, 0);
  const commissionTotal = Number((BigInt(net) * BigInt(commissionBps) + 5_000n) / 10_000n);
  const commissions = allocate(commissionTotal, nets);

  const priced = afterLine.map((l, i) => ({
    ...l.line,
    gross: l.gross,
    discount: l.line.lineDiscount + orderDiscountShares[i]!,
    netAmount: nets[i]!,
    commission: commissions[i]!,
  }));
  return {
    lines: priced,
    gross: priced.reduce((s, l) => s + l.gross, 0),
    discount: priced.reduce((s, l) => s + l.discount, 0),
    net,
    cost: priced.reduce((s, l) => s + l.qty * l.unitCost, 0),
    commission: commissionTotal,
  };
}

/** Kembalian for a cash payment; negative means the customer hasn't paid enough. */
export function cashChange(net: number, tendered: number): number {
  return tendered - net;
}
