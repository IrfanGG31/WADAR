"use client";

import { brand } from "@wadar/brand";
import type { Permission } from "@wadar/contracts/identity";
import { Home, ShoppingCart, Package, Wallet, Users, MessageSquare, Sparkles, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Button } from "@wadar/ui-web";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/beranda", label: "Beranda", icon: Home },
  { href: "/penjualan", label: "Penjualan", icon: ShoppingCart },
  { href: "/stok", label: "Stok", icon: Package },
  { href: "/keuangan", label: "Keuangan", icon: Wallet },
  { href: "/pelanggan", label: "Pelanggan", icon: Users },
  { href: "/asisten", label: "Chat AI", icon: MessageSquare },
  { href: "/konsultasi", label: "Konsultasi Bisnis", icon: Sparkles },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
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
        {[
          { href: "/beranda", label: "Beranda", icon: Home },
          { href: "/penjualan", label: "Transaksi", icon: ShoppingCart },
          { href: "/laporan", label: "Laporan", icon: Wallet },
          { href: "/asisten", label: "Chat AI", icon: MessageSquare },
          { href: "/lainnya", label: "Lainnya", icon: Settings },
        ].map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Navigasi utama"
        className="hidden w-64 shrink-0 flex-col border-r border-border bg-background p-4 md:flex overflow-y-auto"
      >
        <div className="mb-6 mt-2 flex items-center gap-2 px-2 text-2xl font-bold tracking-tight text-primary">
          <span className="relative flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
             <Sparkles className="h-5 w-5 absolute -top-1 -right-1 text-primary-foreground bg-primary rounded-full p-0.5" />
             <span className="font-bold text-xl">W</span>
          </span>
          {brand.name}
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          {visibleItems.map((item) => {
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
        
        {/* Promotion block at bottom of sidebar matching the mockup */}
        <div className="mt-8 rounded-xl bg-primary/10 p-4 relative overflow-hidden">
           <div className="flex items-start gap-3">
             <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
               <Sparkles className="h-5 w-5" />
             </div>
             <div>
                <h4 className="text-xs font-bold text-foreground">Tingkatkan Bisnis Anda Bersama WADAR</h4>
                <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
                  Data lebih rapi, keputusan lebih tepat. Coba lebih maju.
                </p>
             </div>
           </div>
           <div className="mt-3 flex justify-end">
             <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
             </div>
           </div>
        </div>
      </nav>
    </>
  );
}
