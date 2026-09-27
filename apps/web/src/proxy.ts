import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { TENANT_COOKIE_NAME } from "./lib/constants";
import { getWebEnv } from "./lib/env";

// /auth/callback MUST be public: it's hit immediately after the Google OAuth
// redirect, before any session cookie exists yet (the session is only set
// once that route handler calls exchangeCodeForSession) — gating it here
// would bounce every Google sign-in straight back to /masuk before the
// route handler ever runs.
const PUBLIC_PATHS = ["/masuk", "/daftar", "/undangan", "/auth/callback", "/struk"];
/** Marketing landing page: public, but signed-in users go straight to the app. */
const LANDING_PATH = "/";
/** Sign-in/sign-up pages a signed-in user has no reason to see. */
const SIGNED_OUT_ONLY_PATHS = [LANDING_PATH, "/masuk", "/daftar"];
const APP_SHELL_PATHS = [
  "/beranda",
  "/kasir",
  "/pesanan",
  "/asisten",
  "/lainnya",
  "/pengaturan",
  "/stok",
  "/keuangan",
  "/layar-kasir",
  "/penjualan",
  "/pelanggan",
  "/integrasi",
];

/**
 * Next.js 16 renamed `middleware.ts` → `proxy.ts` (same runtime, Node-only
 * now, not Edge-only). Refreshes the Supabase session on every request
 * (`getClaims()` — the currently recommended method, not `getSession()`)
 * and gates `(app)`/`(auth)` routes: no session -> `/masuk`; session but no
 * active tenant yet -> `/onboarding`.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getWebEnv();
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
  const isPublicPath = pathname === LANDING_PATH || PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isAuthenticated && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/masuk";
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && SIGNED_OUT_ONLY_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/beranda";
    return NextResponse.redirect(url);
  }

  const isAppShellPath = APP_SHELL_PATHS.some((path) => pathname.startsWith(path));
  if (isAuthenticated && isAppShellPath && !request.cookies.has(TENANT_COOKIE_NAME)) {
    // Every (app) shell route needs an active tenant — see
    // lib/tenant-cookie.ts for where that cookie gets set (onboarding /
    // accepting an invitation).
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
