import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAppContext } from "../../lib/app-context";
import { createClient } from "../../lib/supabase/server";
import { AppHeader } from "./_components/app-header";
import { AppShellNav } from "./_components/app-shell-nav";
import { FloatingAddButton } from "./_components/floating-add-button";

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  let context: Awaited<ReturnType<typeof getAppContext>>;
  try {
    context = await getAppContext();
  } catch {
    // No active tenant, expired session mid-way, or the cookie points at a
    // tenant the user isn't (or no longer is) a member of — onboarding is
    // the only safe fallback for all of these in M1 (no "pick a tenant"
    // switcher yet).
    redirect("/onboarding");
  }

  const { membership, tenant, outlets, activeOutlet } = context;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userLabel = user?.email ?? user?.phone ?? "Akun";

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppShellNav permissions={membership.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader tenantName={tenant.name} outlets={outlets} activeOutletId={activeOutlet?.id} userLabel={userLabel} />
        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>
      <FloatingAddButton permissions={membership.permissions} />
    </div>
  );
}
