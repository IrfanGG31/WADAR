import { NextResponse, type NextRequest } from "next/server";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Post-sign-in landing: opens the user's shop (oldest membership first), or
 * the create-shop form when they have none yet. A route handler, not a page,
 * so it can redirect straight away without rendering anything.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return NextResponse.redirect(new URL("/masuk", request.url));

  const { data } = await supabase
    .from("memberships")
    .select("created_at, tenants(slug)")
    .eq("user_id", claims.claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Many-to-one embed → one object (an array only in the untyped client's guess).
  const tenant = data?.tenants as unknown as { slug: string } | { slug: string }[] | null | undefined;
  const slug = Array.isArray(tenant) ? tenant[0]?.slug : tenant?.slug;
  return NextResponse.redirect(new URL(slug ? shopPath(slug, "beranda") : "/onboarding", request.url));
}
