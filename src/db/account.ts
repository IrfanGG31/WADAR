import "server-only";
import type { MemberRole } from "@/core/roles";
import { createClient } from "@/lib/supabase/server";

export interface MyAccount {
  email: string | null;
  shops: { slug: string; name: string; role: MemberRole; isDemo: boolean }[];
}

/** The signed-in user's email and every shop they belong to (RLS: own memberships). */
export async function getMyAccount(): Promise<MyAccount | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("role, tenant:tenants(slug, name, is_demo)")
    .eq("user_id", claims.sub)
    .order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as unknown as { role: MemberRole; tenant: { slug: string; name: string; is_demo: boolean } | null }[];
  return {
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    shops: rows.flatMap((r) => (r.tenant ? [{ slug: r.tenant.slug, name: r.tenant.name, role: r.role, isDemo: r.tenant.is_demo }] : [])),
  };
}
