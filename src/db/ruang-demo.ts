import "server-only";
import { connection } from "next/server";
import { parseDemoProfile, type DemoProfile } from "@/core/demo-profiles";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

export interface WeeklyCounts {
  sales: number;
  aiReplies: number;
}

/** Completed sales and assistant replies over the last 7 × 24 hours (RLS: members only). */
export async function getWeeklyCounts(tenantId: string): Promise<WeeklyCounts> {
  await connection();
  const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const supabase = await createClient();
  const [sales, replies] = await Promise.all([
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "void").gte("occurred_at", sinceIso),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("author", "ai").gte("created_at", sinceIso),
  ]);
  if (sales.error) throw sales.error;
  return { sales: sales.count ?? 0, aiReplies: replies.error ? 0 : (replies.count ?? 0) };
}

/** The demo profile of a shop (null for a real shop). Older demo shops derive it from business_type. */
export async function getDemoProfile(shop: { id: string; is_demo: boolean; business_type: string | null }): Promise<DemoProfile | null> {
  if (!shop.is_demo) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").select("demo_profile").eq("id", shop.id).maybeSingle();
  const stored = !error ? (data?.demo_profile as string | null | undefined) : null;
  return stored ? parseDemoProfile(stored) : shop.business_type === "fnb" ? "kopi" : "skincare";
}

export interface MyDemoShop {
  profile: DemoProfile;
  slug: string;
  name: string;
}

/** The demo shops this user already has, one per profile (empty before the demo_variants migration). */
export async function listMyDemoShops(): Promise<MyDemoShop[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_demo_shops");
  if (error) {
    if (isSchemaPending(error)) return [];
    throw error;
  }
  return ((data ?? []) as { profile: string; slug: string; name: string }[]).map((r) => ({ profile: parseDemoProfile(r.profile), slug: r.slug, name: r.name }));
}
