import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/** Exchanges the Google OAuth PKCE `code` for a session (docs.supabase.com/guides/auth/server-side/oauth). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/masuk?error=auth_callback_failed", request.url));
}
