import Link from "next/link";
import { PageTabs } from "@/components/shell/page-tabs";
import { shopPath } from "@/lib/routes";

const TABS = [
  { page: "stok", label: "Stok Produk" },
  { page: "stok/prediksi", label: "Prediksi & Rekomendasi", shortLabel: "Prediksi & Saran" },
] as const;

/** Stock Intelligence tabs (PRD §7.2): Stok Produk · Prediksi & Rekomendasi. */
export function StokTabs({ slug, active }: { slug: string; active: (typeof TABS)[number]["page"] }) {
  return <PageTabs slug={slug} tabs={TABS} active={active} label="Stok" />;
}

/** On phones Stok sits under "Laporan" with Keuangan; one tap across. */
export function ToKeuanganLink({ slug }: { slug: string }) {
  return (
    <Link href={shopPath(slug, "keuangan")} className="text-sm font-medium text-primary md:hidden">
      Lihat keuangan
    </Link>
  );
}
