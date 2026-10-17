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
  href = (page) => shopPath(slug, page),
}: {
  slug: string;
  tabs: readonly PageTab[];
  active: string;
  label: string;
  /** Link of a tab; defaults to `/<slug>/<page>` (Keuangan adds `?periode=`). */
  href?: (page: string) => string;
}) {
  return (
    <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.page}
          href={href(tab.page)}
          aria-current={tab.page === active ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex-none md:px-6",
            tab.page === active ? "bg-background text-foreground shadow-sm" : "text-slate-700 hover:text-foreground",
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
  return <div className="h-[3.25rem] animate-pulse rounded-lg bg-muted" aria-hidden />;
}
