/**
 * The active tenant a signed-in user is operating in. M1 has no
 * multi-tenant switcher UI (design scope: one tenant per onboarding/invite
 * flow) — this cookie is set once after `create-tenant`/`accept-invitation`
 * succeeds and read by every subsequent `x-tenant-id` API call.
 */
export const TENANT_COOKIE_NAME = "wadar_tenant_id";
