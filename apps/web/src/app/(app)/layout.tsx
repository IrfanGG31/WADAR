import type { Permission } from "@wadar/contracts/identity";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetchServer } from "../../lib/api-client-server";
import { AppHeader } from "./_components/app-header";
import { AppShellNav } from "./_components/app-shell-nav";
import { FloatingAddButton } from "./_components/floating-add-button";

interface MyMembership {
  membershipId: string;
  tenantId: string;
  roleKey: string;
  permissions: Permission[];
}

interface Tenant {
  id: string;
  name: string;
}

interface Outlet {
  id: string;
  name: string;
}

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  let membership: MyMembership;
  let tenant: Tenant;
  let outlets: Outlet[];

  try {
    [membership, tenant, outlets] = await Promise.all([
      apiFetchServer<MyMembership>("/v1/memberships/me"),
      apiFetchServer<Tenant>("/v1/tenants/current"),
      apiFetchServer<Outlet[]>("/v1/outlets"),
    ]);
  } catch {
    // No active tenant, expired session mid-way, or the cookie points at a
    // tenant the user isn't (or no longer is) a member of — onboarding is
    // the only safe fallback for all of these in M1 (no "pick a tenant"
    // switcher yet).
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppShellNav permissions={membership.permissions} />
      <div className="flex flex-1 flex-col">
        <AppHeader tenantName={tenant.name} outlets={outlets} />
        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>
      <FloatingAddButton />
    </div>
  );
}
