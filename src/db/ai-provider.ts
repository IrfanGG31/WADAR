import "server-only";
import type { CustomAiConfig } from "@/ai/providers/openai-compatible";
import { createAdminClient } from "@/lib/supabase/admin";
import { openSecret } from "@/lib/secret-box";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

export interface AiProviderSettings {
  base_url: string;
  chat_model: string;
  api_key_hint: string;
  enabled: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  updated_at: string;
}

/** What the owner's settings page shows (RLS: owner only; the key itself is not readable here). */
export async function getAiProviderSettings(tenantId: string): Promise<AiProviderSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_providers")
    .select("base_url, chat_model, api_key_hint, enabled, last_test_at, last_test_ok, last_test_error, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle<AiProviderSettings>();
  if (error && !isSchemaPending(error)) throw error;
  return data ?? null;
}

/** False while the `connect_hub` migration is not applied on this database (Pusat Koneksi shows a notice). */
export async function isConnectHubInstalled(): Promise<boolean> {
  const supabase = await createClient();
  // A plain GET, not a HEAD request: a HEAD response has no body, so the error code would be lost.
  const { error } = await supabase.from("agent_tasks").select("id").limit(1);
  return !isSchemaPending(error);
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: CustomAiConfig | null }>();

/**
 * The shop's enabled model with its decrypted key — server only, via the service role (the
 * ciphertext column is not granted to users). Cached 30 s per instance; null when none, disabled,
 * or the key can no longer be decrypted (then the shop runs on the default model).
 */
export async function loadCustomAi(tenantId: string, now = Date.now(), opts: { includeDisabled?: boolean } = {}): Promise<CustomAiConfig | null> {
  const hit = opts.includeDisabled ? undefined : cache.get(tenantId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  let value: CustomAiConfig | null = null;
  try {
    const { data } = await createAdminClient()
      .from("ai_providers")
      .select("base_url, chat_model, api_key_cipher, enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ base_url: string; chat_model: string; api_key_cipher: string; enabled: boolean }>();
    if (data && (data.enabled || opts.includeDisabled)) {
      value = { baseURL: data.base_url, chatModel: data.chat_model, apiKey: openSecret(data.api_key_cipher) };
    }
  } catch (e) {
    console.error("custom AI config unavailable", e instanceof Error ? e.message : "unknown");
  }
  if (!opts.includeDisabled) cache.set(tenantId, { at: now, value });
  return value;
}

/** After the owner saves or removes the provider, so the next answer uses it. */
export function forgetCustomAi(tenantId: string) {
  cache.delete(tenantId);
}
