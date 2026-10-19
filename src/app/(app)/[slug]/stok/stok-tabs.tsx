import Link from "next/link";
import { PageTabs } from "@/components/shell/page-tabs";
import { shopPath } from "@/lib/routes";

const TABS = [
  { page: "stok", label: "Stok Produk", shortLabel: "Stok" },
  { page: "stok/prediksi", label: "Prediksi & Rekomendasi", shortLabel: "Prediksi" },
  { page: "stok/pembelian", label: "Pembelian" },
] as const;

/** Stock tabs (PRD §7.2 + ADR-005): Stok Produk · Prediksi & Rekomendasi · Pembelian. */
export function StokTabs({ slug, active }: { slug: string; active: (typeof TABS)[number]["page"] }) {
  return <PageTabs slug={slug} tabs={TABS} active={active} label="Stok" />;
}

/** On phones Stok sits under "Laporan" with Keuangan; one tap across. */
export function ToKeuanganLink({ slug }: { slug: string }) {
  return (
    <Link
      href={shopPath(slug, "keuangan")}
      className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
    >
      Lihat keuangan
    </Link>
  );
}
