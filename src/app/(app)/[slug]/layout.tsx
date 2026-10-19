import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { AccountLink } from "@/components/shell/account-link";
import { NavSkeleton } from "@/components/shell/app-nav";
import { RoleNav } from "@/components/shell/role-nav";
import { ServiceWorkerRegister } from "@/components/shell/service-worker-register";
import { ShopName } from "@/components/shell/shop-name";
import { Button } from "@/components/ui/button";
import { signOut } from "../actions";

/**
 * App shell for one shop (/<slug>/…). The frame is static; the nav and the shop
 * name read the slug/session, so they stream in behind Suspense with same-size
 * placeholders.
 */
export default function ShopLayout({ children, params }: LayoutProps<"/[slug]">) {
  return (
    <div className="min-h-dvh bg-surface md:flex" data-surface>
      <Suspense fallback={<NavSkeleton />}>
        <RoleNav params={params} />
        <ServiceWorkerRegister />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-surface/90 px-4 backdrop-blur md:h-16 md:px-10">
          <Suspense fallback={<div className="h-5 w-40 animate-pulse rounded bg-muted" />}>
            <ShopName params={params} />
          </Suspense>
          <div className="flex shrink-0 items-center">
            <Suspense fallback={<div className="h-11 w-11" aria-hidden />}>
              <AccountLink params={params} />
            </Suspense>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="h-11 text-muted-foreground">
                <LogOut className="h-4 w-4" />
                Keluar
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8">{children}</main>
      </div>
    </div>
  );
}
