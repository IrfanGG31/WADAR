"use server";

import { revalidatePath } from "next/cache";
import { newWebhookSecret, WebhookInput } from "@/core/webhooks";
import { permissionDenied } from "@/db/access";
import { isSchemaPending, SCHEMA_PENDING_MESSAGE } from "@/db/schema-pending";
import { getShop } from "@/db/shop";
import { dispatchWebhooks } from "@/db/webhooks";
import { shopPath } from "@/lib/routes";
import { SecretBoxUnavailableError, sealSecret } from "@/lib/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface WebhookActionResult {
  error?: string;
  note?: string;
  /** The signing secret, shown once. */
  secret?: string;
}

const page = (slug: string) => shopPath(slug, "pengaturan/koneksi");

export async function createWebhook(slug: string, input: unknown): Promise<WebhookActionResult> {
  const parsed = WebhookInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const secret = newWebhookSecret();
  let cipher: string;
  try {
    cipher = sealSecret(secret);
  } catch (e) {
    if (e instanceof SecretBoxUnavailableError) return { error: "Server belum punya kunci enkripsi. Hubungi admin aplikasi." };
    throw e;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_webhook_endpoint", {
    p_tenant_id: shop.id,
    p_url: parsed.data.url,
    p_events: parsed.data.events,
    p_secret_cipher: cipher,
  });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : error.code === "22023" ? error.message : "Belum tersimpan. Coba lagi sebentar." };
  revalidatePath(page(slug));
  return { secret, note: "Tersimpan. Simpan rahasia ini di aplikasi penerima untuk memeriksa tanda tangan; hanya tampil sekali." };
}

export async function deleteWebhook(slug: string, id: string): Promise<WebhookActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_webhook_endpoint", { p_id: id });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum terhapus. Coba lagi sebentar." };
  revalidatePath(page(slug));
  return { note: "Dihapus." };
}

/** Tes: one `ping` event to this endpoint, sent now. */
export async function testWebhook(slug: string, id: string): Promise<WebhookActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data: own } = await supabase.from("webhook_endpoints").select("id").eq("tenant_id", shop.id).eq("id", id).maybeSingle();
  if (!own) return { error: "Webhook tidak ditemukan." };
  const db = createAdminClient();
  const { error } = await db.from("outbox_events").insert({ tenant_id: shop.id, type: "ping", subject_id: id, payload: { message: "Tes dari WADAR" } });
  if (error) return { error: "Belum bisa mengirim tes. Coba lagi sebentar." };
  const r = await dispatchWebhooks(db, shop.id);
  const { data: after } = await db.from("webhook_endpoints").select("last_status, last_error").eq("id", id).maybeSingle();
  revalidatePath(page(slug));
  if (r.sent > 0 && after?.last_status) return { note: `Terkirim (HTTP ${after.last_status}).` };
  return { error: `Tes gagal: ${after?.last_error ?? "belum terkirim"}. WADAR mencoba lagi otomatis.` };
}
