/**
 * Rupiah amounts are bigint everywhere (Postgres BIGINT) — never float — and
 * only turned into display strings here, at the UI boundary.
 *
 * Deliberately NOT `Intl.NumberFormat(..., { style: "currency", currency: "IDR" })`:
 * ICU's id-ID currency format puts a non-breaking space after "Rp"
 * ("Rp 1.250.000"), but the product spec writes "Rp1.250.000" (NFR-L10N).
 */
const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

/** Accepts bigint (DB) or a whole-number `number` (JSON). Negative → "-Rp5.000". */
export function formatRupiah(amount: bigint | number): string {
  const value = typeof amount === "number" ? BigInt(Math.trunc(amount)) : amount;
  if (value < 0n) return `-Rp${numberFormatter.format(-value)}`;
  return `Rp${numberFormatter.format(value)}`;
}

/** Compact form for chart axes and tight cards: "Rp1,2 jt", "Rp850 rb". */
export function formatRupiahCompact(amount: bigint | number): string {
  const value = Number(amount);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const compact = (n: number, unit: string) =>
    `${sign}Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)} ${unit}`;
  if (abs >= 1_000_000_000) return compact(abs / 1_000_000_000, "M");
  if (abs >= 1_000_000) return compact(abs / 1_000_000, "jt");
  if (abs >= 1_000) return compact(abs / 1_000, "rb");
  return `${sign}Rp${abs}`;
}

/**
 * Splits `total` rupiah across `weights` proportionally with the largest
 * remainder (Hamilton) method, so the parts are whole rupiah and always sum
 * to exactly `total` — e.g. a transaction discount spread over its lines.
 *
 * Each part gets floor(total × weight / Σweights); the leftover rupiah go one
 * each to the parts with the largest remainders, ties to the earlier index
 * (deterministic). A negative total is split as its absolute value, negated.
 */
export function allocateLargestRemainder(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.some((w) => w < 0n)) {
    throw new RangeError("allocateLargestRemainder: weights must not be negative");
  }
  if (total < 0n) return allocateLargestRemainder(-total, weights).map((part) => -part);

  const weightSum = weights.reduce((sum, w) => sum + w, 0n);
  if (weightSum === 0n) {
    if (total === 0n) return weights.map(() => 0n);
    throw new RangeError("allocateLargestRemainder: cannot split a non-zero total over zero weights");
  }

  const parts = weights.map((w) => (total * w) / weightSum);
  const remainders = weights.map((w, index) => ({ index, remainder: (total * w) % weightSum }));
  let leftover = total - parts.reduce((sum, p) => sum + p, 0n);

  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const { index } of remainders) {
    if (leftover === 0n) break;
    parts[index] += 1n;
    leftover -= 1n;
  }
  return parts;
}
