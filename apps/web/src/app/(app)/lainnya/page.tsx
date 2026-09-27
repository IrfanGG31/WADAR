import type { Permission } from "@wadar/contracts/identity";
import { Contact, Monitor, Package, Plug, Settings, ShoppingBag, Users, Wallet } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { apiFetchServer } from "../../../lib/api-client-server";

interface MyMembership {
  permissions: Permission[];
}

interface MenuItem {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermission: Permission;
}

const MENU_ITEMS: MenuItem[] = [
  {
    href: "/stok",
    label: "Produk & Stok",
    description: "Daftar produk, stok, impor dari Excel",
    icon: Package,
    requiredPermission: "cashier:operate",
  },
  {
    href: "/stok",
    label: "Produk & Stok",
    description: "Daftar produk, stok, impor dari Excel",
    icon: Package,
    requiredPermission: "inventory:manage",
  },
  {
    href: "/keuangan",
    label: "Keuangan",
    description: "Uang masuk & keluar, dompet, untung per produk",
    icon: Wallet,
    requiredPermission: "finance:view",
  },
  {
    href: "/layar-kasir",
    label: "Layar Kasir",
    description: "Tampilan besar uang masuk untuk meja kasir",
    icon: Monitor,
    requiredPermission: "cashier:operate",
  },
  {
    href: "/pengaturan/toko",
    label: "Pengaturan Toko",
    description: "Nama toko, outlet, zona waktu",
    icon: Settings,
    requiredPermission: "settings:manage",
  },
  {
    href: "/pengaturan/tim",
    label: "Tim",
    description: "Undang anggota, lihat & ubah peran",
    icon: Users,
    requiredPermission: "team:manage",
  },
];

/** UI mockups built ahead of their milestone (each page carries a "Pratinjau desain" notice). */
const PREVIEW_ITEMS: Omit<MenuItem, "requiredPermission">[] = [
  { href: "/penjualan", label: "Pesanan lintas kanal", description: "Shopee, TikTok, WhatsApp dalam satu daftar", icon: ShoppingBag },
  { href: "/pelanggan", label: "Pelanggan & chat", description: "Kotak masuk WhatsApp dengan balasan asisten", icon: Contact },
  { href: "/integrasi", label: "Integrasi", description: "Hubungkan marketplace, WhatsApp, dan kasir lain", icon: Plug },
];

/** DoD: "kasir hanya melihat menu sesuai peran" — items with no matching permission just don't render. */
export default async function LainnyaPage() {
  const membership = await apiFetchServer<MyMembership>("/v1/memberships/me");
  const seen = new Set<string>();
  const visibleItems = MENU_ITEMS.filter((item) => {
    if (!membership.permissions.includes(item.requiredPermission) || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });

  const showPreviews = membership.permissions.includes("settings:manage");

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Lainnya</h1>
      {visibleItems.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Belum ada menu tambahan untuk peranmu saat ini.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted"
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {showPreviews && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">Segera hadir · pratinjau desain</h2>
          <div className="mt-2 flex flex-col gap-2">
            {PREVIEW_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 hover:bg-muted"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
