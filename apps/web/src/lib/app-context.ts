import type { Permission } from "@wadar/contracts/identity";
import { cache } from "react";
import { apiFetchServer } from "./api-client-server";
import { getOutletIdHint, resolveActiveOutlet } from "./tenant-cookie-server";

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

/**
 * getAppContext() plus the page's own data, fetched in PARALLEL instead of
 * one after the other — each is a full round trip to the API, so running
 * them back to back doubled the wait on every menu tap.
 *
 * `load` starts right away with the outlet remembered in the header cookie.
 * If that turns out not to be the active outlet (no cookie yet, or an outlet
 * that was removed), it runs once more with the right one. `data` is a
 * promise so the page can check permissions before awaiting it; a rejected
 * load that the page never awaits (e.g. it redirects) is not an unhandled
 * rejection.
 */
export async function getAppContextWith<T>(load: (outletId: string | undefined) => Promise<T>) {
  const hint = await getOutletIdHint();
  const early = load(hint);
  early.catch(() => undefined);
  const context = await getAppContext();
  const outletId = context.activeOutlet?.id;
  const data = outletId === hint ? early : load(outletId);
  data.catch(() => undefined);
  return { ...context, data };
}
