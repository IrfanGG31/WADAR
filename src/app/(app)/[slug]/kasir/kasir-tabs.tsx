import { PageTabs } from "@/components/shell/page-tabs";

const TABS = [
  { page: "kasir", label: "Kasir" },
  { page: "kasir/riwayat", label: "Riwayat" },
  { page: "kasir/marketplace", label: "Marketplace" },
] as const;

/** Transaksi tabs (PRD §7.2): Kasir · Riwayat · Marketplace (order import, IMP-1..3). */
export function KasirTabs({ slug, active }: { slug: string; active: (typeof TABS)[number]["page"] }) {
  return <PageTabs slug={slug} tabs={TABS} active={active} label="Transaksi" />;
}
