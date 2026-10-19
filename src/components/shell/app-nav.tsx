"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { brand } from "@/brand";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/core/roles";
import { DESKTOP_NAV, MOBILE_NAV, currentPage, isActive, navFor } from "./nav-items";

/** Bottom tab bar, shown below the md breakpoint (≤ 768px). Only the pages `role` may open. */
export function BottomTabs({ role }: { role: MemberRole | null }) {
  const { slug } = useParams<{ slug: string }>();
  const page = currentPage(usePathname());

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {navFor(MOBILE_NAV, role).map((item) => {
        const active = isActive(item, page);
        const Icon = item.icon;
        return (
          <Link
            key={item.page}
            href={shopPath(slug, item.page)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active ? "bg-primary/10" : "group-hover:bg-muted")}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar, shown from the md breakpoint up. Only the pages `role` may open. */
export function Sidebar({ role }: { role: MemberRole | null }) {
  const { slug } = useParams<{ slug: string }>();
  const page = currentPage(usePathname());

  return (
    <nav
      aria-label="Navigasi utama"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-border/70 bg-surface px-3 py-4 md:flex"
    >
      <div className="mb-8 mt-1 flex h-8 items-center px-3">
        <Image src={brand.mark.src} alt="" width={brand.mark.width} height={brand.mark.height} className="h-6 w-auto" priority />
        <span className="ml-2 font-display text-lg font-extrabold tracking-tight text-navy">{brand.name}</span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {navFor(DESKTOP_NAV, role).map((item) => {
          const active = isActive(item, page);
          const Icon = item.icon;
          return (
            <Link
              key={item.page}
              href={shopPath(slug, item.page)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-background font-semibold text-navy shadow-[0_1px_2px_rgb(8_42_92/0.08),0_0_0_1px_rgb(8_42_92/0.06)]"
                  : "font-medium text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
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
      <div aria-hidden className="hidden h-dvh w-60 shrink-0 flex-col gap-0.5 border-r border-border/70 bg-surface px-3 py-4 md:flex">
        <div className="mb-8 mt-1 h-8 w-28 animate-pulse rounded-lg bg-muted" />
        {DESKTOP_NAV.map((item) => (
          <div key={item.page} className="h-11 animate-pulse rounded-lg bg-muted" />
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
