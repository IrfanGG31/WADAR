"use server";

import { revalidatePath } from "next/cache";
import { generateApiKey, NewApiKeyInput } from "@/core/channels/api-key";
import { permissionDenied } from "@/db/access";
import { isSchemaPending, SCHEMA_PENDING_MESSAGE } from "@/db/schema-pending";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export type CreateKeyResult = { error: string } | { key: string; prefix: string };

/** The full key is returned once, here; WADAR keeps only its hash. */
export async function createApiKey(slug: string, input: unknown): Promise<CreateKeyResult> {
  const parsed = NewApiKeyInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const key = generateApiKey();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_api_key", {
    p_tenant_id: shop.id,
    p_name: parsed.data.name,
    p_prefix: key.prefix,
    p_key_hash: key.hash,
    p_scopes: parsed.data.scopes,
  });
  if (error) {
    if (isSchemaPending(error)) return { error: SCHEMA_PENDING_MESSAGE };
    return { error: error.code === "22023" ? error.message : "Kunci belum dibuat. Coba lagi sebentar." };
  }
  revalidatePath(shopPath(slug, "pengaturan/koneksi"));
  return { key: key.full, prefix: key.prefix };
}

export async function revokeApiKey(slug: string, keyId: string): Promise<{ error?: string }> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_api_key", { p_key_id: keyId });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Kunci belum dicabut. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "pengaturan/koneksi"));
  return {};
}
