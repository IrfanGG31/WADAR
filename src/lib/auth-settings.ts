import { getPublicEnv } from "@/lib/env";

/** Sign-in methods actually switched on in the Supabase project. */
export interface AuthAvailability {
  google: boolean;
}

interface SupabaseAuthSettings {
  external?: Record<string, boolean | undefined>;
}

/**
 * Reads Supabase's public `/auth/v1/settings` so the login page can hide
 * Google while it isn't configured (otherwise the button opens a raw
 * "provider is not enabled" JSON page). Undefined when unreadable — callers
 * then show every method.
 */
export async function fetchAuthAvailability(): Promise<AuthAvailability | undefined> {
  const env = getPublicEnv();
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
    if (!res.ok) return undefined;
    const settings = (await res.json()) as SupabaseAuthSettings;
    return { google: settings.external?.google === true };
  } catch {
    return undefined;
  }
}
