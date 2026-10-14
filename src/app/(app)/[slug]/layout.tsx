import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { BottomTabs, NavSkeleton, Sidebar } from "@/components/shell/app-nav";
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
    <div className="min-h-dvh md:flex">
      <Suspense fallback={<NavSkeleton />}>
        <Sidebar />
        <BottomTabs />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
          <Suspense fallback={<div className="h-5 w-40 animate-pulse rounded bg-muted" />}>
            <ShopName params={params} />
          </Suspense>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="h-11 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Keluar
            </Button>
          </form>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>
    </div>
  );
}
