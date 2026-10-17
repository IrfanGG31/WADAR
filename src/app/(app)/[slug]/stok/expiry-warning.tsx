import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { expiryRisks, narrateExpiry, narrateExpiryOverview } from "@/core/expiry";
import type { ExpiryVariant } from "@/db/stock";
import { shopPath } from "@/lib/routes";

/**
 * Risiko kedaluwarsa (STK-5) on the Stok screens: variants expiring within
 * `windowDays` or already past. `rates` (variant id → sell rate from Stock
 * Intelligence) adds "±N belum terjual saat itu". Renders nothing without risks.
 */
export function ExpiryWarning({
  slug,
  today,
  variants,
  windowDays,
  rates,
  productIds,
}: {
  slug: string;
  today: string | null;
  variants: ExpiryVariant[];
  windowDays: number;
  rates?: ReadonlyMap<string, number>;
  /** variant id → product id, for the "ubah" link. */
  productIds?: ReadonlyMap<string, string>;
}) {
  if (!today || variants.length === 0) return null;
  const risks = expiryRisks(
    variants.map((v) => ({ ...v, rate: rates?.get(v.variant_id) ?? null })),
    today,
    windowDays,
  );
  const overview = narrateExpiryOverview(risks, windowDays);
  if (!overview) return null;
  const past = risks.some((r) => r.status === "lewat");

  return (
    <section
      aria-labelledby="risiko-kedaluwarsa"
      className={`flex flex-col gap-2 rounded-xl border p-4 ${past ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
    >
      <h2 id="risiko-kedaluwarsa" className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4" aria-hidden />
        Risiko kedaluwarsa
      </h2>
      <p className="text-sm font-medium">{overview}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {risks.map((r) => {
          const productId = productIds?.get(r.variant_id);
          return (
            <li key={r.variant_id} className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 flex-1">{narrateExpiry(r)}</span>
              {productId && (
                <Link
                  href={shopPath(slug, `stok/produk/${productId}`)}
                  className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Ubah tanggal
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
