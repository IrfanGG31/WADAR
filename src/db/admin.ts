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
  revenue30d: number;
  lastSaleAt: string | null;
  createdAt: string;
}

export type ShopKind = "real" | "demo" | "all";

export interface AdminOverview {
  realShops: number;
  realActive7d: number;
  realNew7d: number;
  demoShops: number;
  sales30d: number;
  revenue30d: number;
}

export async function adminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error;
  const r = ((data ?? [])[0] ?? {}) as Record<string, unknown>;
  return {
    realShops: Number(r.real_shops ?? 0),
    realActive7d: Number(r.real_active_7d ?? 0),
    realNew7d: Number(r.real_new_7d ?? 0),
    demoShops: Number(r.demo_shops ?? 0),
    sales30d: Number(r.sales_30d ?? 0),
    revenue30d: Number(r.revenue_30d ?? 0),
  };
}

export async function adminListShops(query: string, kind: ShopKind): Promise<AdminShopRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_shops", { p_query: query, p_limit: 200, p_kind: kind });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    isDemo: Boolean(r.is_demo),
    demoProfile: r.demo_profile ? parseDemoProfile(r.demo_profile) : null,
    ownerEmail: (r.owner_email as string | null) ?? null,
    sales30d: Number(r.sales_30d ?? 0),
    revenue30d: Number(r.revenue_30d ?? 0),
    lastSaleAt: (r.last_sale_at as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

export interface DemoSummaryRow {
  profile: DemoProfile;
  shops: number;
  visitorShops: number;
  lastCreated: string | null;
}

export async function adminDemoSummary(): Promise<DemoSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_demo_summary");
  if (error) {
    if (isSchemaPending(error)) return [];
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    profile: parseDemoProfile(r.profile),
    shops: Number(r.shops ?? 0),
    visitorShops: Number(r.visitor_shops ?? 0),
    lastCreated: (r.last_created as string | null) ?? null,
  }));
}
