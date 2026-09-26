/**
 * The only place rupiah amounts are formatted for display (CLAUDE.md aturan #3).
 * Amounts are stored/passed around as bigint (matches Postgres BIGINT) — never
 * float — and converted to a display string only here, at the UI boundary.
 *
 * Deliberately NOT `Intl.NumberFormat(..., { style: "currency", currency: "IDR" })`:
 * ICU's id-ID currency format inserts a non-breaking space between "Rp" and
 * the digits (e.g. "Rp 1.250.000"), but PRD §10 specifies no space
 * ("Rp1.250.000"). Formatting the number plainly and prefixing "Rp" ourselves
 * gives exact control over that.
 */
const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

/**
 * Accepts bigint (DB BIGINT) or a whole-number `number` (API JSON carries
 * rupiah as safe integers). Negative amounts render as "-Rp5.000".
 */
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
