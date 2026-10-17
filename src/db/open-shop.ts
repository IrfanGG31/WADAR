import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The shop behind a public buyer URL (/w/<slug>, widget API), read with the service role.
 * A shop scheduled for deletion (GAP #6) is closed for buyers: null, like an unknown slug.
 * Postgres 42703 = the deletion column is not there yet (migration not applied): stay open.
 */
export async function findOpenShop(db: SupabaseClient, slug: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db.from("tenants").select("id, name, deletion_requested_at").eq("slug", slug).maybeSingle();
  if (error?.code === "42703") {
    const { data: legacy, error: le } = await db.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
    if (le) throw le;
    return legacy ? { id: legacy.id as string, name: legacy.name as string } : null;
  }
  if (error) throw error;
  if (!data || data.deletion_requested_at) return null;
  return { id: data.id as string, name: data.name as string };
}
