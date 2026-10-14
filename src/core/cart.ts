/**
 * POS cart preview (whole rupiah, JS integers). The sale itself is priced by
 * public.record_sale; these mirror its rules so the cashier sees the same total.
 */
export interface CartLine {
  variantId: string;
  qty: number;
  unitPrice: number;
  lineDiscount?: number;
}

export interface ChannelFee {
  /** Percent, up to 3 decimals (numeric(6,3) in the database). */
  feePct: number;
  feeFixed: number;
}

export interface CartTotals {
  subtotal: number;
  orderDiscount: number;
  total: number;
  /** Estimated marketplace commission on (subtotal − order discount). */
  platformFee: number;
  /** What the shop receives after the commission. */
  net: number;
  items: number;
}

export function lineTotal(line: CartLine): number {
  return line.qty * line.unitPrice - (line.lineDiscount ?? 0);
}

/** Same as app.estimate_platform_fee: round(net × pct / 100) + fixed, 0 when the channel has no fee. */
export function estimatePlatformFee(net: number, { feePct, feeFixed }: ChannelFee): number {
  if (feePct === 0 && feeFixed === 0) return 0;
  const pctMilli = BigInt(Math.round(feePct * 1000));
  const scaled = BigInt(net) * pctMilli;
  // Half away from zero, like Postgres round(numeric).
  const rounded = scaled >= 0n ? (scaled * 2n + 100_000n) / 200_000n : -((-scaled * 2n + 100_000n) / 200_000n);
  return Number(rounded) + feeFixed;
}

export function cartTotals(lines: CartLine[], orderDiscount: number, channel: ChannelFee): CartTotals {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const discount = Math.min(Math.max(orderDiscount, 0), subtotal);
  const total = subtotal - discount;
  const platformFee = estimatePlatformFee(total, channel);
  return {
    subtotal,
    orderDiscount: discount,
    total,
    platformFee,
    net: total - platformFee,
    items: lines.reduce((sum, line) => sum + line.qty, 0),
  };
}

/** Change for a cash payment; null while the cash received is not enough. */
export function changeDue(total: number, paid: number | undefined): number | null {
  if (paid === undefined || paid < total) return null;
  return paid - total;
}

/** Quick cash buttons: exact amount, then the next round notes above the total. */
export function cashSuggestions(total: number): number[] {
  const out = new Set<number>([total]);
  for (const step of [10_000, 20_000, 50_000, 100_000]) {
    const up = Math.ceil(total / step) * step;
    if (up > total) out.add(up);
    if (out.size >= 4) break;
  }
  return [...out].sort((a, b) => a - b);
}
