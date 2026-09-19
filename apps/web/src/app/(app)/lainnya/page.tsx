import type { Permission } from "@wadar/contracts/identity";
import { Settings, Users } from "lucide-react";
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

/** DoD: "kasir hanya melihat menu sesuai peran" — items with no matching permission just don't render. */
export default async function LainnyaPage() {
  const membership = await apiFetchServer<MyMembership>("/v1/memberships/me");
  const visibleItems = MENU_ITEMS.filter((item) => membership.permissions.includes(item.requiredPermission));

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
    </div>
  );
}
