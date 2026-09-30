import { OUTLET_COOKIE_NAME, TENANT_COOKIE_NAME } from "./constants";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Client-side only (reads/writes `document.cookie`) — call from a Client Component. */
export function setActiveTenantId(tenantId: string): void {
  document.cookie = `${TENANT_COOKIE_NAME}=${tenantId}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

export function getActiveTenantIdClient(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${TENANT_COOKIE_NAME}=([^;]*)`));
  const value = match?.[1];
  return value !== undefined ? decodeURIComponent(value) : undefined;
}

export function getActiveOutletIdClient(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${OUTLET_COOKIE_NAME}=([^;]*)`));
  const value = match?.[1];
  return value !== undefined ? decodeURIComponent(value) : undefined;
}

export function clearActiveTenantId(): void {
  document.cookie = `${TENANT_COOKIE_NAME}=; path=/; max-age=0`;
  document.cookie = `${OUTLET_COOKIE_NAME}=; path=/; max-age=0`;
}

export function setActiveOutletId(outletId: string): void {
  document.cookie = `${OUTLET_COOKIE_NAME}=${outletId}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
