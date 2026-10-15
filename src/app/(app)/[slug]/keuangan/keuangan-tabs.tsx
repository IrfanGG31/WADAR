import Link from "next/link";
import { PageTabs } from "@/components/shell/page-tabs";
import { shopPath } from "@/lib/routes";

const TABS = [
  { page: "keuangan", label: "Ringkasan" },
  { page: "keuangan/margin", label: "Margin" },
  { page: "keuangan/detail", label: "Detail" },
] as const;

/** Financial Insight tabs (PRD §7.2): Ringkasan · Margin · Detail. */
export function KeuanganTabs({ slug, active }: { slug: string; active: (typeof TABS)[number]["page"] }) {
  return <PageTabs slug={slug} tabs={TABS} active={active} label="Keuangan" />;
}

/** On phones Keuangan sits under "Laporan" with Stok; one tap across. */
export function ToStokLink({ slug }: { slug: string }) {
  return (
    <Link href={shopPath(slug, "stok/prediksi")} className="text-sm font-medium text-primary md:hidden">
      Lihat stok
    </Link>
  );
}
