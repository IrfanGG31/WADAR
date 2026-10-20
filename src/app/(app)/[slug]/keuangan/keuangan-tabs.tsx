import Link from "next/link";
import { PageTabs } from "@/components/shell/page-tabs";
import { withFinancePeriod, type FinancePeriodDays } from "@/core/finance-insight";
import { shopPath } from "@/lib/routes";

const TABS = [
  { page: "keuangan", label: "Ringkasan" },
  { page: "keuangan/margin", label: "Margin" },
  { page: "keuangan/detail", label: "Detail" },
  { page: "keuangan/pengeluaran", label: "Pengeluaran", shortLabel: "Biaya" },
  { page: "keuangan/neraca", label: "Neraca & Jurnal", shortLabel: "Neraca" },
] as const;

/** Financial Insight tabs (PRD §7.2): Ringkasan · Margin · Detail · Pengeluaran (FIN-1) · Neraca (ADR-006); every tab keeps the chosen `?periode=`. */
export function KeuanganTabs({ slug, active, days }: { slug: string; active: (typeof TABS)[number]["page"]; days: FinancePeriodDays }) {
  return (
    <PageTabs
      slug={slug}
      tabs={TABS}
      active={active}
      label="Keuangan"
      href={(page) => withFinancePeriod(shopPath(slug, page), days)}
    />
  );
}

/** On phones Keuangan sits under "Laporan" with Stok; one tap across. */
export function ToStokLink({ slug }: { slug: string }) {
  return (
    <Link
      href={shopPath(slug, "stok/prediksi")}
      className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
    >
      Lihat stok
    </Link>
  );
}
