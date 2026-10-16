"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { brand } from "@/brand";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { DESKTOP_NAV, MOBILE_NAV, currentPage, isActive } from "./nav-items";

/** Bottom tab bar, shown below the md breakpoint (≤ 768px). */
export function BottomTabs() {
  const { slug } = useParams<{ slug: string }>();
  const page = currentPage(usePathname());

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
    >
      {MOBILE_NAV.map((item) => {
        const active = isActive(item, page);
        const Icon = item.icon;
        return (
          <Link
            key={item.page}
            href={shopPath(slug, item.page)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar, shown from the md breakpoint up. */
export function Sidebar() {
  const { slug } = useParams<{ slug: string }>();
  const page = currentPage(usePathname());

  return (
    <nav
      aria-label="Navigasi utama"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-background p-4 md:flex"
    >
      <div className="mb-6 mt-2 flex items-center px-2">
        <Image src={brand.logo.src} alt={brand.logo.alt} width={140} height={140} className="h-auto w-28" priority />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {DESKTOP_NAV.map((item) => {
          const active = isActive(item, page);
          const Icon = item.icon;
          return (
            <Link
              key={item.page}
              href={shopPath(slug, item.page)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
              )}
            >
              <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Same footprint as the real nav, so nothing shifts when it streams in. */
export function NavSkeleton() {
  return (
    <>
      <div aria-hidden className="hidden h-dvh w-64 shrink-0 flex-col gap-2 border-r border-border p-4 md:flex">
        <div className="mb-6 mt-2 h-8 w-28 animate-pulse rounded-lg bg-muted" />
        {DESKTOP_NAV.map((item) => (
          <div key={item.page} className="h-11 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div aria-hidden className="fixed inset-x-0 bottom-0 flex h-14 items-center gap-2 border-t border-border bg-background px-3 md:hidden">
        {MOBILE_NAV.map((item) => (
          <div key={item.page} className="h-8 flex-1 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </>
  );
}
