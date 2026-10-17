import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { ShopDeletionRow } from "@/core/shop-deletion";
import { createClient } from "@/lib/supabase/server";

export interface Shop {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  is_demo: boolean;
  business_type: string | null;
}

/**
 * The shop behind /<slug>/…, read as the signed-in user: RLS only returns it
 * to members, so a non-member gets a 404 rather than someone else's shop.
 * Cached per request — layout and page share one query.
 */
export const getShop = cache(async (slug: string): Promise<Shop> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, timezone, is_demo, business_type")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data as Shop;
});

/** Like {@link getShop} but returns null for a non-member / unknown slug (API routes answer 404 themselves). */
export async function findShop(slug: string): Promise<Shop | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, timezone, is_demo, business_type")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Shop | null) ?? null;
}

/**
 * Stage of a scheduled shop deletion (GAP #6). Kept out of {@link getShop}: a database without
 * the deletion columns yet (migration 20261017024527 not applied) reads as "not scheduled"
 * instead of breaking every page.
 */
export async function getShopDeletion(tenantId: string): Promise<ShopDeletionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").select("deletion_requested_at, purge_after").eq("id", tenantId).maybeSingle();
  if (error) {
    console.error("shop deletion state unavailable", error.code);
    return null;
  }
  return (data as ShopDeletionRow | null) ?? null;
}
