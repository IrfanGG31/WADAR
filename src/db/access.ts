import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { can, DENIED_PARAM, deniedMessage, type MemberRole, type Permission } from "@/core/roles";
import { getShop, type Shop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's role in one shop (CON-6), or null without a session / membership.
 * Read as the user: RLS on memberships returns their own row. Cached per request.
 */
export const getMyRole = cache(async (tenantId: string): Promise<MemberRole | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle<{ role: MemberRole }>();
  if (error) throw error;
  return data?.role ?? null;
});

/** null when the user may do it; otherwise the message to show (server actions return it as `error`). */
export async function permissionDenied(tenantId: string, permission: Permission): Promise<string | null> {
  const role = await getMyRole(tenantId);
  return can(role, permission) ? null : deniedMessage(role, permission);
}

/**
 * Page guard: call before a restricted page loads any data. A member without the permission
 * is sent to Beranda with `?ditolak=<permission>` (a banner explains), never shown the page.
 * A non-member already gets a 404 from getShop.
 */
export async function requirePermission(slug: string, permission: Permission): Promise<{ shop: Shop; role: MemberRole }> {
  const shop = await getShop(slug);
  const role = await getMyRole(shop.id);
  if (!role || !can(role, permission)) redirect(`${shopPath(slug, "beranda")}?${DENIED_PARAM}=${permission}`);
  return { shop, role };
}
