import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getWebEnv } from "../env";

/**
 * Server Component / Server Action client. A NEW client must be created
 * per request (never module-level singleton) — see @supabase/ssr's own
 * createServerClient docs.
 *
 * `setAll` is best-effort here: Server Components can't set cookies at all
 * (Next.js throws if you try outside a Server Action/Route Handler) — the
 * try/catch below is exactly what @supabase/ssr's own docs recommend for
 * this case. Session refresh is still handled correctly because
 * `proxy.ts` runs before every request and refreshes/writes the session
 * cookie there.
 */
export async function createClient() {
  const env = getWebEnv();
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
          // Called from a Server Component — proxy.ts already refreshes
          // the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
