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
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive border-2 border-background"></span>
        </button>

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
