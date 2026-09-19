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

export function formatRupiah(amount: bigint): string {
  return `Rp${numberFormatter.format(amount)}`;
}
