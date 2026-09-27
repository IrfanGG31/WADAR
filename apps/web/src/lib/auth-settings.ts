import { getWebEnv } from "./env";

/** Sign-in methods actually switched on in the Supabase project. */
export interface AuthAvailability {
  google: boolean;
  phone: boolean;
  anonymous: boolean;
}

interface SupabaseAuthSettings {
  external?: Record<string, boolean | undefined>;
}

/**
 * Reads Supabase's public `/auth/v1/settings` (anon key only) so the login
 * page can hide methods that aren't configured. Without this, "Lanjutkan
 * dengan Google" on a project where Google is off navigates to a raw JSON
 * "provider is not enabled" page. Returns undefined when the settings can't
 * be read — callers then show every method, as before.
 */
export async function fetchAuthAvailability(): Promise<AuthAvailability | undefined> {
  const env = getWebEnv();
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
    if (!res.ok) return undefined;
    const settings = (await res.json()) as SupabaseAuthSettings;
    const external = settings.external ?? {};
    return {
      google: external.google === true,
      phone: external.phone === true,
      anonymous: external.anonymous_users === true,
    };
  } catch {
    return undefined;
  }
}
