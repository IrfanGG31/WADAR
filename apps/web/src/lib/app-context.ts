import type { Permission } from "@wadar/contracts/identity";
import { cache } from "react";
import { apiFetchServer } from "./api-client-server";
import { resolveActiveOutlet } from "./tenant-cookie-server";

export interface MyMembership {
  membershipId: string;
  tenantId: string;
  roleKey: string;
  permissions: Permission[];
}

export interface Outlet {
  id: string;
  name: string;
  address?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  timezone: string;
}

/** Deduplicated per request (layout + page both call it). */
export const getAppContext = cache(async () => {
  const [membership, tenant, outlets] = await Promise.all([
    apiFetchServer<MyMembership>("/v1/memberships/me"),
    apiFetchServer<Tenant>("/v1/tenants/current"),
    apiFetchServer<Outlet[]>("/v1/outlets"),
  ]);
  const activeOutlet = await resolveActiveOutlet(outlets);
  const can = (...anyOf: Permission[]) => anyOf.some((p) => membership.permissions.includes(p));
  return { membership, tenant, outlets, activeOutlet, can };
});
