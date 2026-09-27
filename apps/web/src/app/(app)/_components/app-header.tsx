"use client";

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@wadar/ui-web";
import { Check, ChevronDown, KeyRound, LogOut, Search, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "../../../lib/supabase/client";
import { clearActiveTenantId, setActiveOutletId } from "../../../lib/tenant-cookie";
import { RealtimeToasts } from "./realtime-toasts";

interface Outlet {
  id: string;
  name: string;
}

export function AppHeader({
  tenantName,
  outlets,
  activeOutletId,
  userLabel,
  canChangePassword = false,
}: {
  tenantName: string;
  outlets: Outlet[];
  activeOutletId: string | undefined;
  userLabel: string;
  /** False for demo (anonymous) users — they have no email to attach a password to. */
  canChangePassword?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const activeOutlet = outlets.find((o) => o.id === activeOutletId) ?? outlets[0];

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearActiveTenantId();
    router.push("/masuk");
  }

  function chooseOutlet(outletId: string) {
    setActiveOutletId(outletId);
    router.refresh();
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (query) router.push(`/stok?search=${encodeURIComponent(query)}`);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-left outline-none hover:bg-muted md:hidden">
            <Store className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{activeOutlet?.name ?? tenantName}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <OutletMenu outlets={outlets} activeId={activeOutlet?.id} onChoose={chooseOutlet} />
        </DropdownMenu>
        <form onSubmit={submitSearch} className="relative hidden w-full max-w-md md:flex" role="search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari produk, SKU, atau barcode..."
            aria-label="Cari produk"
            className="h-10 w-full rounded-full border-none bg-muted/50 pl-9 focus-visible:ring-1 focus-visible:ring-primary/30"
          />
        </form>
      </div>

      <div className="flex items-center gap-2">
        <RealtimeToasts />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Menu akun"
            className="flex items-center gap-3 rounded-full p-1 pr-2 text-left outline-none transition-colors hover:bg-muted"
          >
            <Avatar>
              <AvatarFallback>{userLabel.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="max-w-40 truncate text-sm font-semibold leading-tight">{tenantName}</p>
              <p className="text-xs text-muted-foreground">{activeOutlet?.name}</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="truncate text-sm font-medium leading-none">{userLabel}</p>
                <p className="text-xs leading-none text-muted-foreground">{tenantName}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Pilih outlet</DropdownMenuLabel>
            {outlets.map((outlet) => (
              <DropdownMenuItem key={outlet.id} onSelect={() => chooseOutlet(outlet.id)}>
                {outlet.id === activeOutlet?.id ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 w-4" />}
                {outlet.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {canChangePassword && (
              <DropdownMenuItem onSelect={() => router.push("/masuk/sandi-baru")}>
                <KeyRound className="mr-2 h-4 w-4" />
                Ganti kata sandi
              </DropdownMenuItem>
            )}
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

function OutletMenu({
  outlets,
  activeId,
  onChoose,
}: {
  outlets: Outlet[];
  activeId: string | undefined;
  onChoose: (id: string) => void;
}) {
  return (
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>Pilih outlet</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {outlets.map((outlet) => (
        <DropdownMenuItem key={outlet.id} onSelect={() => onChoose(outlet.id)}>
          {outlet.id === activeId ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 w-4" />}
          {outlet.name}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
