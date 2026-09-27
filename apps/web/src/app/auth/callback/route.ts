import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * Exchanges the PKCE `code` for a session — Google OAuth, email magic links
 * and password-reset links all land here (docs.supabase.com/guides/auth/server-side/oauth).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/onboarding";
  // Same-site paths only: `new URL("https://evil.example", base)` — or
  // "//evil.example" / "/\\evil.example", which URL parsers also treat as
  // another host — would send a freshly signed-in user off-site.
  const next = /^\/(?![/\\])/.test(requestedNext) ? requestedNext : "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/masuk?error=auth_callback_failed", request.url));
}
