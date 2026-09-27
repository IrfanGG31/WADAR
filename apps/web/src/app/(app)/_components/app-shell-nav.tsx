"use client";

import { brand } from "@wadar/brand";
import type { Permission } from "@wadar/contracts/identity";
import {
  Home,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Package,
  ShoppingCart,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Shown if the member has ANY of these (M1 DoD: "kasir hanya melihat menu sesuai peran"). */
  requiresAny?: Permission[];
}

/** PRD §8.1 — the 5 bottom tabs on mobile. */
const MOBILE_ITEMS: NavItem[] = [
  { href: "/beranda", label: "Beranda", icon: Home },
  { href: "/kasir", label: "Kasir", icon: ShoppingCart, requiresAny: ["cashier:operate"] },
  { href: "/pesanan", label: "Pesanan", icon: ListChecks, requiresAny: ["orders:manage"] },
  { href: "/asisten", label: "Asisten", icon: MessageSquare, requiresAny: ["assistant:use"] },
  { href: "/lainnya", label: "Lainnya", icon: MoreHorizontal },
];

/** Desktop sidebar: the same tabs plus the "Lainnya" destinations used daily. */
const DESKTOP_ITEMS: NavItem[] = [
  { href: "/beranda", label: "Beranda", icon: Home },
  { href: "/kasir", label: "Kasir", icon: ShoppingCart, requiresAny: ["cashier:operate"] },
  { href: "/pesanan", label: "Pesanan", icon: ListChecks, requiresAny: ["orders:manage"] },
  { href: "/stok", label: "Produk & Stok", icon: Package, requiresAny: ["catalog:manage", "inventory:manage", "cashier:operate"] },
  { href: "/keuangan", label: "Keuangan", icon: Wallet, requiresAny: ["finance:view"] },
  { href: "/asisten", label: "Asisten", icon: MessageSquare, requiresAny: ["assistant:use"] },
  { href: "/lainnya", label: "Lainnya", icon: MoreHorizontal },
];

function visible(items: NavItem[], permissions: Permission[]): NavItem[] {
  return items.filter((item) => !item.requiresAny || item.requiresAny.some((p) => permissions.includes(p)));
}

export function AppShellNav({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
      >
        {visible(MOBILE_ITEMS, permissions).map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Navigasi utama"
        className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-background p-4 md:flex"
      >
        <div className="mb-6 mt-2 flex items-center px-2">
          <Image src={brand.logo.src} alt={brand.logo.alt} width={140} height={140} className="w-28 h-auto" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          {visible(DESKTOP_ITEMS, permissions).map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="relative mt-8 overflow-hidden rounded-xl bg-primary/10 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">{brand.tagline}</h4>
              <p className="mt-1 text-xs leading-tight text-muted-foreground">
                Tanya apa saja soal tokomu di menu Asisten.
              </p>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
