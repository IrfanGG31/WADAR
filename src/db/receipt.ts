import "server-only";
import { createClient } from "@supabase/supabase-js";
import { loadPublicReceipt, type PublicReceipt } from "@/core/receipt";
import { getPublicEnv } from "@/lib/env";

/**
 * Public receipt by token (POS-3), read as `anon` through get_public_receipt —
 * no session, no service role, no table access: the function returns one sale or null.
 */
export async function getPublicReceipt(token: string): Promise<PublicReceipt | null> {
  const env = getPublicEnv();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return loadPublicReceipt(token, async (t) => {
    const { data, error } = await db.rpc("get_public_receipt", { p_token: t });
    return { data, error };
  });
}
