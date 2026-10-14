import Link from "next/link";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const TABS = [
  { page: "kasir", label: "Kasir" },
  { page: "kasir/riwayat", label: "Riwayat" },
] as const;

/** Transaksi tabs (PRD §7.2): Kasir · Riwayat. Marketplace import is out of sprint scope. */
export function KasirTabs({ slug, active }: { slug: string; active: (typeof TABS)[number]["page"] }) {
  return (
    <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Transaksi">
      {TABS.map((tab) => (
        <Link
          key={tab.page}
          href={shopPath(slug, tab.page)}
          aria-current={tab.page === active ? "page" : undefined}
          className={cn(
            "flex h-9 flex-1 items-center justify-center rounded-md text-sm font-medium md:flex-none md:px-6",
            tab.page === active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
