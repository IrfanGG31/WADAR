import { cookies } from "next/headers";
import { TENANT_COOKIE_NAME } from "./constants";

/** Server Component only. */
export async function getActiveTenantIdServer(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TENANT_COOKIE_NAME)?.value;
}
