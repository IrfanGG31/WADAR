"use client";

import { brand } from "@wadar/brand";
import type { Permission } from "@wadar/contracts/identity";
import { Home, ListChecks, MoreHorizontal, Radar, ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermission?: Permission;
}

/** PRD §8.1 — 5 fixed tabs. Items with a `requiredPermission` are hidden for roles that lack it (M1 DoD: "kasir hanya melihat menu sesuai peran"). */
const NAV_ITEMS: NavItem[] = [
  { href: "/beranda", label: "Beranda", icon: Home },
  { href: "/kasir", label: "Kasir", icon: ShoppingCart, requiredPermission: "cashier:operate" },
  { href: "/pesanan", label: "Pesanan", icon: ListChecks, requiredPermission: "orders:manage" },
  { href: "/asisten", label: "Asisten", icon: Sparkles, requiredPermission: "assistant:use" },
  { href: "/lainnya", label: "Lainnya", icon: MoreHorizontal },
];

export function AppShellNav({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requiredPermission || permissions.includes(item.requiredPermission),
  );

  return (
    <>
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
      >
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Navigasi utama"
        className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border p-4 md:flex"
      >
        <div className="mb-4 flex items-center gap-2 px-2 text-lg font-semibold text-primary">
          <Radar className="h-5 w-5" />
          {brand.name}
        </div>
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
