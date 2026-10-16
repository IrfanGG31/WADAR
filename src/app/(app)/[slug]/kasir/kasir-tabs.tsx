import { PageTabs } from "@/components/shell/page-tabs";

const TABS = [
  { page: "kasir", label: "Kasir" },
  { page: "kasir/riwayat", label: "Riwayat" },
] as const;

/** Transaksi tabs (PRD §7.2): Kasir · Riwayat. Marketplace import is out of sprint scope. */
export function KasirTabs({ slug, active }: { slug: string; active: (typeof TABS)[number]["page"] }) {
  return <PageTabs slug={slug} tabs={TABS} active={active} label="Transaksi" />;
}
