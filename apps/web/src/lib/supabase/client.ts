import { createBrowserClient } from "@supabase/ssr";
import { getWebEnv } from "../env";

/**
 * Browser client — `@supabase/ssr` 0.12.x falls back to `document.cookie`
 * automatically when no custom `cookies` option is passed, which is all
 * this app needs (no custom cookie store).
 */
export function createClient() {
  const env = getWebEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
