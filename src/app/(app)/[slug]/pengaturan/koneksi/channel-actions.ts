"use server";

import { revalidatePath } from "next/cache";
import type { ChatChannelKind } from "@/core/channels/adapter";
import {
  newWebhookSecret,
  TelegramConnectInput,
  telegramDeleteWebhook,
  telegramGetMe,
  telegramSetWebhook,
  telegramWebhookInfo,
} from "@/core/channels/telegram";
import { newVerifyToken, WhatsAppConnectInput, whatsappNumberInfo, whatsappSubscribeApp, whatsappSubscribeWaba } from "@/core/channels/whatsapp";
import { permissionDenied } from "@/db/access";
import { loadConnection, type LoadedConnection } from "@/db/channel-connections";
import { isSchemaPending, SCHEMA_PENDING_MESSAGE } from "@/db/schema-pending";
import { getShop } from "@/db/shop";
import { requestOrigin } from "@/lib/request-origin";
import { shopPath } from "@/lib/routes";
import { SecretBoxUnavailableError, sealSecret, secretHint } from "@/lib/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface ChannelActionResult {
  error?: string;
  note?: string;
}

const page = (slug: string) => shopPath(slug, "pengaturan/koneksi");
const NOT_PUBLIC =
  "Sambungan ini butuh alamat https yang bisa diakses publik. Buka WADAR dari domain yang sudah online (bukan localhost), lalu sambungkan lagi.";
const NO_KEY = "Server belum punya kunci enkripsi (SUPABASE_SERVICE_ROLE_KEY). Hubungi admin aplikasi.";

function saveError(error: { code?: string }): string {
  if (isSchemaPending(error)) return SCHEMA_PENDING_MESSAGE;
  if (error.code === "23505") return "Akun ini sudah tersambung ke toko lain di WADAR. Putuskan dulu di toko itu.";
  return "Belum tersimpan. Coba lagi sebentar.";
}

function seal(secrets: Record<string, string>): string | null {
  try {
    return sealSecret(JSON.stringify(secrets));
  } catch (e) {
    if (e instanceof SecretBoxUnavailableError) return null;
    throw e;
  }
}

async function ownerShop(slug: string) {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  return { shop, denied };
}

/** This shop's connector of `kind` with its secrets (the id comes from an RLS read as the owner). */
async function ownConnection(tenantId: string, kind: ChatChannelKind): Promise<LoadedConnection | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("channel_connections").select("id").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle();
  if (!data) return null;
  const connection = await loadConnection(createAdminClient(), data.id as string, kind);
  return connection?.tenantId === tenantId ? connection : null;
}

async function setStatus(id: string, ok: boolean, error?: string) {
  const supabase = await createClient();
  await supabase.rpc("set_channel_connection_status", { p_id: id, p_status: ok ? "active" : "error", p_error: ok ? null : (error ?? null) });
}

// ── Telegram ────────────────────────────────────────────────────────────────

/** Paste the BotFather token → check it → save (encrypted) → point the bot's webhook at WADAR. */
export async function connectTelegram(slug: string, input: unknown): Promise<ChannelActionResult> {
  const parsed = TelegramConnectInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Token belum valid." };
  const { shop, denied } = await ownerShop(slug);
  if (denied) return { error: denied };
  const { origin, isPublicHttps } = await requestOrigin();
  if (!isPublicHttps) return { error: NOT_PUBLIC };

  const token = parsed.data.bot_token;
  const me = await telegramGetMe(token);
  if (!me.ok) return { error: me.error };
  const webhookSecret = newWebhookSecret();
  const cipher = seal({ bot_token: token, webhook_secret: webhookSecret });
  if (!cipher) return { error: NO_KEY };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_channel_connection", {
    p_tenant_id: shop.id,
    p_kind: "telegram",
    p_label: `@${me.bot.username}`,
    p_settings: { account_id: String(me.bot.id), username: me.bot.username, bot_name: me.bot.first_name },
    p_secret_cipher: cipher,
    p_secret_hint: secretHint(token),
  });
  if (error || !id) return { error: saveError(error ?? {}) };
  const hook = await telegramSetWebhook(token, `${origin}/api/channels/telegram/${id}`, webhookSecret);
  await setStatus(id as string, hook.ok, hook.ok ? undefined : hook.error);
  revalidatePath(page(slug));
  return hook.ok ? { note: `Tersambung ke @${me.bot.username}. Coba kirim pesan ke bot-nya dari HP.` } : { error: hook.error };
}

/** Points the webhook at this domain again with the stored token (after a domain change or a conflict). */
export async function reconnectTelegram(slug: string): Promise<ChannelActionResult> {
  const { shop, denied } = await ownerShop(slug);
  if (denied) return { error: denied };
  const { origin, isPublicHttps } = await requestOrigin();
  if (!isPublicHttps) return { error: NOT_PUBLIC };
  const c = await ownConnection(shop.id, "telegram");
  if (!c?.secrets.bot_token || !c.secrets.webhook_secret) return { error: "Token bot tidak terbaca lagi. Tempel ulang token dari @BotFather." };
  const hook = await telegramSetWebhook(c.secrets.bot_token, `${origin}/api/channels/telegram/${c.id}`, c.secrets.webhook_secret);
  await setStatus(c.id, hook.ok, hook.ok ? undefined : hook.error);
  revalidatePath(page(slug));
  return hook.ok ? { note: `${c.label} tersambung lagi.` } : { error: hook.error };
}

// ── WhatsApp Cloud API ──────────────────────────────────────────────────────

/** Five values from Meta → check the number → save (encrypted) → register the webhook → subscribe the account. */
export async function connectWhatsApp(slug: string, input: unknown): Promise<ChannelActionResult> {
  const parsed = WhatsAppConnectInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const { shop, denied } = await ownerShop(slug);
  if (denied) return { error: denied };
  const { origin, isPublicHttps } = await requestOrigin();
  if (!isPublicHttps) return { error: NOT_PUBLIC };

  const v = parsed.data;
  const number = await whatsappNumberInfo(v.phone_number_id, v.access_token);
  if (!number.ok) return { error: number.error };
  const verifyToken = newVerifyToken();
  const cipher = seal({ access_token: v.access_token, app_secret: v.app_secret, verify_token: verifyToken });
  if (!cipher) return { error: NO_KEY };

  const display = number.number.display_phone_number;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_channel_connection", {
    p_tenant_id: shop.id,
    p_kind: "whatsapp",
    p_label: number.number.verified_name ? `${display} · ${number.number.verified_name}` : display,
    p_settings: { account_id: v.phone_number_id, phone_number_id: v.phone_number_id, waba_id: v.waba_id, app_id: v.app_id },
    p_secret_cipher: cipher,
    p_secret_hint: secretHint(v.access_token),
  });
  if (error || !id) return { error: saveError(error ?? {}) };

  // Meta calls our GET handshake inside this request, so the connection must already be saved.
  const sub = await whatsappSubscribeApp({ appId: v.app_id, appSecret: v.app_secret, callbackUrl: `${origin}/api/channels/whatsapp/${id}`, verifyToken });
  const waba = sub.ok ? await whatsappSubscribeWaba(v.waba_id, v.access_token) : null;
  const problem = !sub.ok ? sub.error : waba && !waba.ok ? waba.error : null;
  await setStatus(id as string, !problem, problem ?? undefined);
  revalidatePath(page(slug));
  return problem
    ? { error: `${problem} Kamu juga bisa mengisi webhook manual di Meta (lihat "Isi manual di Meta").` }
    : { note: `Tersambung ke ${display}. Kirim pesan WhatsApp ke nomor ini untuk mencoba.` };
}

// ── Both ────────────────────────────────────────────────────────────────────

/** "Tes": asks Telegram/Meta whether the connection still works, and records the answer. */
export async function testChannel(slug: string, kind: ChatChannelKind): Promise<ChannelActionResult> {
  const { shop, denied } = await ownerShop(slug);
  if (denied) return { error: denied };
  const c = await ownConnection(shop.id, kind);
  if (!c) return { error: "Belum tersambung, atau rahasianya tidak terbaca lagi. Sambungkan ulang." };

  let problem: string | null = null;
  let note = "";
  if (kind === "telegram") {
    const r = await telegramWebhookInfo(c.secrets.bot_token ?? "");
    if (!r.ok) problem = r.error;
    else if (!r.info.url.endsWith(`/api/channels/telegram/${c.id}`)) {
      problem = "Webhook bot sekarang mengarah ke aplikasi lain. Klik Sambungkan ulang supaya pesan masuk ke WADAR lagi.";
    } else if (r.info.last_error_message && r.info.last_error_date && Date.now() / 1000 - r.info.last_error_date < 3600) {
      problem = `Telegram gagal mengirim pesan ke WADAR: ${r.info.last_error_message}`;
    } else {
      note = `Sehat. ${c.label} menerima pesan${r.info.pending_update_count ? `, ${r.info.pending_update_count} menunggu diproses` : ""}.`;
    }
  } else {
    const r = await whatsappNumberInfo(c.settings.phone_number_id ?? "", c.secrets.access_token ?? "");
    if (!r.ok) problem = r.error;
    else note = `Sehat. Nomor ${r.number.display_phone_number} bisa dipakai.`;
  }
  await setStatus(c.id, !problem, problem ?? undefined);
  revalidatePath(page(slug));
  return problem ? { error: problem } : { note };
}

export async function disconnectChannel(slug: string, kind: ChatChannelKind): Promise<ChannelActionResult> {
  const { shop, denied } = await ownerShop(slug);
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data } = await supabase.from("channel_connections").select("id").eq("tenant_id", shop.id).eq("kind", kind).maybeSingle();
  if (!data) return {};
  if (kind === "telegram") {
    const c = await ownConnection(shop.id, "telegram");
    if (c?.secrets.bot_token) await telegramDeleteWebhook(c.secrets.bot_token);
  }
  const { error } = await supabase.rpc("delete_channel_connection", { p_id: data.id });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum terputus. Coba lagi sebentar." };
  revalidatePath(page(slug));
  return {
    note:
      kind === "telegram"
        ? "Terputus. Bot tidak lagi dijawab WADAR; riwayat chat tetap ada."
        : "Terputus dari WADAR. Hapus juga webhook di Meta (WhatsApp › Configuration) kalau nomor ini dipakai aplikasi lain.",
  };
}
