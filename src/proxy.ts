import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { AFTER_SIGN_IN_PATH } from "@/lib/routes";

/**
 * Pages anyone may open. /auth/callback must stay public: it runs right after
 * the Google/email-link redirect, before the session cookie exists.
 * /w/<slug> is the shop's public customer-chat widget; /api/widget/ is its anonymous API.
 */
const PUBLIC_PREFIXES = ["/masuk", "/auth/callback", "/w/", "/api/widget/"];
/** Pages a signed-in user has no reason to see. */
const SIGNED_OUT_ONLY_PATHS = ["/", "/masuk", "/masuk/admin"];

/**
 * Refreshes the Supabase session on every request (`getClaims()`, which
 * validates the JWT — not `getSession()`) and keeps signed-out users out of
 * the app. Tenant membership is enforced by RLS when pages read data, not here.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = data !== null;
  const pathname = request.nextUrl.pathname;
  const isPublic = pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isAuthenticated && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/masuk";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && SIGNED_OUT_ONLY_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = AFTER_SIGN_IN_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
