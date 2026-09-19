"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wadar/ui-web";
import { ChevronDown, LogOut, Store } from "lucide-react";
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
    <header className="flex items-center justify-between border-b border-border px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">{tenantName}</p>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-semibold">
            <Store className="h-4 w-4" />
            {activeOutlet?.name ?? "Belum ada outlet"}
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Pilih outlet</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {outlets.map((outlet) => (
              <DropdownMenuItem key={outlet.id} onSelect={() => setActiveOutletId(outlet.id)}>
                {outlet.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full bg-muted p-2" aria-label="Menu akun">
          <LogOut className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={handleLogout}>Keluar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
