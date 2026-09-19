"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@wadar/ui-web";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * PRD §8.1's floating "+" — quick actions limited to what M1 actually has
 * (undang anggota, tambah outlet). Other tabs (Kasir/Pesanan/Asisten) are
 * still placeholders, so their "quick add" actions land in M2/M3/M8/M9.
 */
export function FloatingAddButton() {
  const router = useRouter();

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
          <DropdownMenuItem onSelect={() => router.push("/pengaturan/tim")}>Undang anggota tim</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/pengaturan/toko")}>Tambah outlet</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
