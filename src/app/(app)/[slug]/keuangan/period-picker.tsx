import Link from "next/link";
import { financePeriodOptions, type FinancePeriodDays } from "@/core/finance-insight";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** "7 hari · 30 hari" switch (FIN-3): plain links, so the choice lives in the URL (`?periode=30`). */
export function PeriodPicker({ slug, page, days }: { slug: string; page: string; days: FinancePeriodDays }) {
  return (
    <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1" aria-label="Periode">
      {financePeriodOptions(days).map((o) => (
        <Link
          key={o.days}
          href={{ pathname: shopPath(slug, page), query: o.query }}
          aria-current={o.active ? "true" : undefined}
          className={cn(
            "flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            o.active ? "bg-background text-foreground shadow-sm" : "text-slate-700 hover:text-foreground",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export function PeriodPickerSkeleton() {
  return <div className="h-[3.25rem] w-44 animate-pulse rounded-lg bg-muted" aria-hidden />;
}
