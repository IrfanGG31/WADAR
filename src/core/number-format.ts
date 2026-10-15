/**
 * Non-money number display (Bahasa Indonesia: comma decimals, dot thousands).
 * Money stays in src/core/money.ts; these are for rates, percentages and counts.
 */
const oneDecimal = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 23.456 → "23,5%"; 20 → "20%". */
export function formatPercent(pct: number): string {
  return `${oneDecimal.format(pct)}%`;
}

/** 2.44 → "2,4"; 1200 → "1.200". */
export function formatDecimal(n: number): string {
  return oneDecimal.format(n);
}

/** 1234 → "1.234". */
export function formatCount(n: number): string {
  return integer.format(n);
}
