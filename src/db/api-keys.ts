import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashMatches, parseApiKey, type ApiScope } from "@/core/channels/api-key";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Owner's list (RLS; the hash column is not readable here). */
export async function listApiKeys(tenantId: string): Promise<ApiKeyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, scopes, created_at, last_used_at, revoked_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error && !isSchemaPending(error)) throw error;
  return (data ?? []) as ApiKeyRow[];
}

export interface ApiCaller {
  keyId: string;
  tenantId: string;
  scopes: ApiScope[];
  slug: string;
  timezone: string;
}

/**
 * Authorization header → the shop it speaks for, or null. Service role (the hash is not granted
 * to users); the comparison is timing-safe. Writes go through `api_*` RPCs that re-check the key
 * and act as its owner, so a key revoked a moment ago fails there too.
 */
export async function authenticateApiKey(db: SupabaseClient, header: string | null): Promise<ApiCaller | null> {
  const parsed = parseApiKey(header);
  if (!parsed) return null;
  const { data } = await db
    .from("api_keys")
    .select("id, tenant_id, key_hash, scopes, revoked_at, tenants!inner(slug, timezone, deletion_requested_at)")
    .eq("prefix", parsed.prefix)
    .maybeSingle<{
      id: string;
      tenant_id: string;
      key_hash: string;
      scopes: ApiScope[];
      revoked_at: string | null;
      tenants: { slug: string; timezone: string; deletion_requested_at: string | null };
    }>();
  if (!data || data.revoked_at || !hashMatches(parsed.full, data.key_hash)) return null;
  // A shop scheduled for deletion is closed to outside apps, like it is to buyers.
  if (data.tenants.deletion_requested_at) return null;
  return { keyId: data.id, tenantId: data.tenant_id, scopes: data.scopes, slug: data.tenants.slug, timezone: data.tenants.timezone };
}
