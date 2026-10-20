import "server-only";
import { parseDemoProfile, type DemoProfile } from "@/core/demo-profiles";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

/** WADAR staff (app.platform_admins), checked in the database for the signed-in user. */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return false;
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) {
    if (isSchemaPending(error)) return false;
    throw error;
  }
  return data === true;
}

export interface AdminShopRow {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  demoProfile: DemoProfile | null;
  ownerEmail: string | null;
  sales30d: number;
  createdAt: string;
}

export async function adminListShops(query: string): Promise<AdminShopRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_shops", { p_query: query, p_limit: 100 });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    isDemo: Boolean(r.is_demo),
    demoProfile: r.demo_profile ? parseDemoProfile(r.demo_profile) : null,
    ownerEmail: (r.owner_email as string | null) ?? null,
    sales30d: Number(r.sales_30d ?? 0),
    createdAt: String(r.created_at),
  }));
}
