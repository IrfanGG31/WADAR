import Link from "next/link";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface PageTab {
  /** Page under the shop slug, e.g. "stok/prediksi". */
  page: string;
  label: string;
  /** Shorter label for phones (≤ 640px), when `label` would crowd a 390px screen. */
  shortLabel?: string;
}

/**
 * Route-per-tab navigation (like Kasir · Riwayat): each tab is its own URL, so
 * a tab can be linked, prefetched and streamed on its own.
 */
export function PageTabs({
  slug,
  tabs,
  active,
  label,
}: {
  slug: string;
  tabs: readonly PageTab[];
  active: string;
  label: string;
}) {
  return (
    <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.page}
          href={shopPath(slug, tab.page)}
          aria-current={tab.page === active ? "page" : undefined}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium md:flex-none md:px-6",
            tab.page === active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.shortLabel ? (
            <>
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </>
          ) : (
            tab.label
          )}
        </Link>
      ))}
    </nav>
  );
}

export function PageTabsSkeleton() {
  return <div className="h-11 animate-pulse rounded-lg bg-muted" />;
}
