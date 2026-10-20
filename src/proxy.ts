import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { AFTER_SIGN_IN_PATH } from "@/lib/routes";
import { OFFLINE_PATH } from "@/lib/service-worker";

/**
 * Pages anyone may open. /auth/callback must stay public: it runs right after
 * the Google/email-link redirect, before the session cookie exists.
 * /w/<slug> is the shop's public customer-chat widget; /api/widget/ is its anonymous API.
 * /privasi is the privacy policy; /sw.js is the service worker (app shell + push, fetched without a page)
 * and /offline the page it precaches.
 * /api/cron/ is called by Vercel Cron (no session) and checks CRON_SECRET itself.
 * /api/v1/ is the WADAR API for outside apps: no session, every route checks its API key itself.
 * /struk/<token> is a buyer's receipt: one sale behind a random token (POS-3).
 * /juri is the judges' entry: pick a segment demo shop (each visitor gets their own copy).
 */
const PUBLIC_PREFIXES = ["/masuk", "/auth/callback", "/w/", "/api/widget/", "/api/cron/", "/api/v1/", "/api/channels/", "/privasi", "/sw.js", "/struk/", "/juri"];
/** Pages a signed-in user has no reason to see. */
const SIGNED_OUT_ONLY_PATHS = ["/", "/masuk", "/masuk/admin"];

export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === OFFLINE_PATH || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

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
  const isPublic = isPublicPath(pathname);

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
