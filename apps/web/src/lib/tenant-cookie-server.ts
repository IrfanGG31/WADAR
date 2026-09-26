import { cookies } from "next/headers";
import { OUTLET_COOKIE_NAME, TENANT_COOKIE_NAME } from "./constants";

/** Server Component only. */
export async function getActiveTenantIdServer(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TENANT_COOKIE_NAME)?.value;
}

export interface OutletSummary {
  id: string;
  name: string;
}

/** The header's outlet choice if it's still one of this tenant's outlets, else the first outlet. */
export async function resolveActiveOutlet<T extends OutletSummary>(outlets: T[]): Promise<T | undefined> {
  const store = await cookies();
  const chosen = store.get(OUTLET_COOKIE_NAME)?.value;
  return outlets.find((o) => o.id === chosen) ?? outlets[0];
}
