"use server";

import { revalidatePath } from "next/cache";
import { pingCustomAi } from "@/ai";
import { AiProviderInput } from "@/core/channels/ai-provider";
import { permissionDenied } from "@/db/access";
import { forgetCustomAi, loadCustomAi } from "@/db/ai-provider";
import { isSchemaPending, SCHEMA_PENDING_MESSAGE } from "@/db/schema-pending";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { SecretBoxUnavailableError, sealSecret, secretHint } from "@/lib/secret-box";
import { createClient } from "@/lib/supabase/server";

export interface AiActionResult {
  error?: string;
  note?: string;
}

const page = (slug: string) => shopPath(slug, "pengaturan/koneksi");

/**
 * Tes lalu simpan: the new endpoint must answer before it replaces anything, so buyers never land
 * on a broken model. Editing without a new key tests (and keeps) the stored key.
 */
export async function saveAiProvider(slug: string, input: unknown): Promise<AiActionResult> {
  const parsed = AiProviderInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };

  const { base_url, chat_model, api_key } = parsed.data;
  const stored = api_key ? null : await loadCustomAi(shop.id, Date.now(), { includeDisabled: true });
  const key = api_key || stored?.apiKey;
  if (!key) return { error: "Isi API key." };

  const ping = await pingCustomAi({ baseURL: base_url, chatModel: chat_model, apiKey: key });
  if (!ping.ok) return { error: `Belum tersimpan. ${ping.error ?? "Tes koneksi gagal."}` };

  let cipher: string | null = null;
  try {
    cipher = api_key ? sealSecret(api_key) : null;
  } catch (e) {
    if (e instanceof SecretBoxUnavailableError) return { error: "Server belum punya kunci enkripsi (SUPABASE_SERVICE_ROLE_KEY). Hubungi admin aplikasi." };
    throw e;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_ai_provider", {
    p_tenant_id: shop.id,
    p_base_url: base_url,
    p_chat_model: chat_model,
    p_api_key_cipher: cipher,
    p_api_key_hint: api_key ? secretHint(api_key) : null,
  });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum tersimpan. Coba lagi sebentar." };
  await supabase.rpc("set_ai_provider_state", { p_tenant_id: shop.id, p_enabled: true, p_test_ok: true, p_test_error: null });
  forgetCustomAi(shop.id);
  revalidatePath(page(slug));
  return { note: `Tersambung (${(ping.latencyMs / 1000).toFixed(1)} dtk). Chat pembeli dan Konsultasi sekarang memakai ${chat_model}.` };
}

export async function testAiProvider(slug: string): Promise<AiActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const cfg = await loadCustomAi(shop.id, Date.now(), { includeDisabled: true });
  if (!cfg) return { error: "Belum ada Otak AI yang tersimpan." };
  const ping = await pingCustomAi(cfg);
  const supabase = await createClient();
  await supabase.rpc("set_ai_provider_state", { p_tenant_id: shop.id, p_enabled: null, p_test_ok: ping.ok, p_test_error: ping.error });
  revalidatePath(page(slug));
  return ping.ok ? { note: `Tersambung (${(ping.latencyMs / 1000).toFixed(1)} dtk).` } : { error: ping.error ?? "Tes koneksi gagal." };
}

export async function setAiProviderEnabled(slug: string, enabled: boolean): Promise<AiActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ai_provider_state", { p_tenant_id: shop.id, p_enabled: enabled });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum tersimpan. Coba lagi sebentar." };
  forgetCustomAi(shop.id);
  revalidatePath(page(slug));
  return {};
}

export async function removeAiProvider(slug: string): Promise<AiActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_ai_provider", { p_tenant_id: shop.id });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum terhapus. Coba lagi sebentar." };
  forgetCustomAi(shop.id);
  revalidatePath(page(slug));
  return { note: "Dihapus. WADAR kembali memakai AI bawaan." };
}
