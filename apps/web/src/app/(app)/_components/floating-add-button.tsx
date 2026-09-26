"use client";

import type { Permission } from "@wadar/contracts/identity";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@wadar/ui-web";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface QuickAction {
  label: string;
  href: string;
  requiresAny: Permission[];
}

/** PRD §8.1: Catat jual · Catat pengeluaran · Tambah produk · Tanya asisten — only what the role may do. */
const ACTIONS: QuickAction[] = [
  { label: "Catat jual", href: "/kasir", requiresAny: ["cashier:operate"] },
  { label: "Catat pengeluaran", href: "/keuangan/pengeluaran/baru", requiresAny: ["finance:manage"] },
  { label: "Tambah produk", href: "/stok/baru", requiresAny: ["catalog:manage"] },
  { label: "Tanya asisten", href: "/asisten", requiresAny: ["assistant:use"] },
];

export function FloatingAddButton({ permissions }: { permissions: Permission[] }) {
  const router = useRouter();
  const actions = ACTIONS.filter((a) => a.requiresAny.some((p) => permissions.includes(p)));
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Tambah"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          <Plus className="h-6 w-6" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action) => (
            <DropdownMenuItem key={action.href} onSelect={() => router.push(action.href)} className="min-h-11 text-base">
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
