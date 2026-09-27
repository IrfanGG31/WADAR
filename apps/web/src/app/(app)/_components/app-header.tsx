"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Avatar,
  AvatarFallback,
} from "@wadar/ui-web";
import { Bell, ChevronDown, LogOut, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { clearActiveTenantId } from "../../../lib/tenant-cookie";

interface Outlet {
  id: string;
  name: string;
}

export function AppHeader({ tenantName, outlets }: { tenantName: string; outlets: Outlet[] }) {
  const router = useRouter();
  const [activeOutletId, setActiveOutletId] = useState(outlets[0]?.id);
  const activeOutlet = outlets.find((o) => o.id === activeOutletId) ?? outlets[0];

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearActiveTenantId();
    router.push("/masuk");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex flex-1 items-center gap-4">
         <div className="relative w-full max-w-md hidden md:flex">
           <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
           <Input 
             type="search" 
             placeholder="Cari produk, transaksi, atau pertanyaan..." 
             className="pl-9 h-10 w-full rounded-full bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30"
           />
         </div>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors outline-none">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive border-2 border-background"></span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-sm">Notifikasi</span>
              <span className="text-xs text-primary cursor-pointer hover:underline">Tandai semua dibaca</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto flex flex-col divide-y divide-border">
              
              {/* Urgent Notification */}
              <div className="px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3 cursor-pointer">
                <div className="h-8 w-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-lg">🧴</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-destructive">Stok kritis: Serum Niacinamide</span>
                  <span className="text-xs text-muted-foreground">Tersisa 8 unit (habis dalam 2 hari).</span>
                  <span className="text-[10px] text-muted-foreground font-medium mt-1">2 menit yang lalu</span>
                </div>
              </div>

              {/* Insight Notification */}
              <div className="px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3 cursor-pointer bg-primary/5">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-lg">📈</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-blue-700">Insight Penjualan</span>
                  <span className="text-xs text-muted-foreground">Penjualan naik 18% dari promo 9.9.</span>
                  <span className="text-[10px] text-muted-foreground font-medium mt-1">1 jam yang lalu</span>
                </div>
              </div>

              {/* Recommendation Notification */}
              <div className="px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3 cursor-pointer">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-lg">✨</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-emerald-700">Rekomendasi Reorder</span>
                  <span className="text-xs text-muted-foreground">Waktunya pesan ulang 50 unit Kardus Packing M.</span>
                  <span className="text-[10px] text-muted-foreground font-medium mt-1">3 jam yang lalu</span>
                </div>
              </div>

            </div>
            <div className="px-4 py-2 border-t border-border text-center">
              <span className="text-xs text-primary font-medium cursor-pointer hover:underline">Lihat Semua Notifikasi</span>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-3 hover:bg-muted p-1 pr-2 rounded-full transition-colors text-left outline-none">
            <Avatar>
              <AvatarFallback>S</AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-sm font-semibold leading-tight">Salsabila</p>
              <p className="text-xs text-muted-foreground">{activeOutlet?.name ?? tenantName}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">Salsabila</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {tenantName}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Pilih outlet</DropdownMenuLabel>
            {outlets.map((outlet) => (
              <DropdownMenuItem key={outlet.id} onSelect={() => setActiveOutletId(outlet.id)}>
                {outlet.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
