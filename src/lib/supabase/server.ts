import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";

/**
 * Server Component / Server Action / Route Handler client, acting as the
 * signed-in user (anon key + session cookie → RLS applies). Create one per
 * request, never a module-level singleton.
 *
 * Server Components can't write cookies, so `setAll` is best-effort there;
 * `src/proxy.ts` refreshes the session cookie on every request anyway.
 *
 * `connection()` keeps every query at request time: supabase-js reads the clock
 * (session expiry), which a runtime prefetch with cookies would otherwise reject.
 */
export async function createClient() {
  const env = getPublicEnv();
  await connection();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy.ts already refreshed the session.
        }
      },
    },
  });
}
