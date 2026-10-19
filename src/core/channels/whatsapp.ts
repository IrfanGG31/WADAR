import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ChannelAdapter, ChannelCredentials, InboundMessage, SendResult, VerifyResult, WebhookRequest } from "./adapter";

/**
 * WhatsApp Cloud API connector (ADR-004), Meta's official API — no gateway or unofficial bot.
 * The owner creates a Meta app with the WhatsApp product and pastes five values; WADAR checks the
 * number, registers its own webhook on the app (`/{app-id}/subscriptions`, Meta calls our GET
 * handshake right away) and subscribes the app to the business account. Every POST from Meta is
 * signed with the app secret (X-Hub-Signature-256), and only messages to the shop's own number are
 * taken. Free-form replies are allowed within 24 hours of the buyer's last message; after that
 * WhatsApp only accepts template messages, which the owner is told plainly.
 */
export const GRAPH_API = "https://graph.facebook.com";
export const GRAPH_VERSION = "v23.0";
const MAX_TEXT = 4096;

const numericId = (what: string) => z.string().trim().regex(/^\d{5,25}$/, `${what} berupa angka saja.`);

export const WhatsAppConnectInput = z.object({
  phone_number_id: numericId("Phone number ID"),
  waba_id: numericId("WhatsApp Business Account ID"),
  app_id: numericId("App ID"),
  app_secret: z.string().trim().regex(/^[a-f0-9]{32}$/i, "App secret berisi 32 huruf/angka (App settings › Basic › App secret › Show)."),
  access_token: z
    .string()
    .trim()
    .min(30, "Access token terlalu pendek. Salin utuh.")
    .max(1000)
    .regex(/^[A-Za-z0-9_-]+$/, "Access token hanya huruf dan angka, tanpa spasi. Salin utuh."),
});
export type WhatsAppConnectInput = z.infer<typeof WhatsAppConnectInput>;

/** What is sealed in `channel_connections.secret_cipher` for a WhatsApp number. */
export interface WhatsAppSecrets {
  access_token: string;
  app_secret: string;
  /** Answered back in Meta's GET handshake; shown to the owner for manual setup. */
  verify_token: string;
}

export function newVerifyToken(): string {
  return `wadar_${randomBytes(18).toString("base64url")}`;
}

type GraphResult<T> = { ok: true; result: T } | { ok: false; status: number; code: number | null; message: string };

async function graph<T>(
  fetchFn: typeof fetch,
  path: string,
  init: { method: "GET" | "POST"; token?: string; json?: unknown; form?: Record<string, string> },
): Promise<GraphResult<T>> {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let body: string | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  }
  let res: Response;
  try {
    res = await fetchFn(`${GRAPH_API}/${GRAPH_VERSION}/${path}`, { method: init.method, headers, body, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, status: 0, code: null, message: timeout ? "Meta tidak menjawab (timeout)." : "Tidak bisa menghubungi Meta." };
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: number } }) | null;
  if (res.ok && json && !json.error) return { ok: true, result: json };
  return { ok: false, status: res.status, code: json?.error?.code ?? null, message: json?.error?.message ?? `HTTP ${res.status}` };
}

/** Graph error → what the owner can act on. */
export function describeWhatsAppError(code: number | null, message: string): string {
  switch (code) {
    case 190:
      return "Access token kedaluwarsa atau salah. Buat token permanen (System User di Business Settings), lalu sambungkan ulang.";
    case 100:
    case 803:
      return "ID tidak ditemukan, atau token tidak punya izin whatsapp_business_messaging dan whatsapp_business_management. Cek lagi ID-nya.";
    case 10:
    case 200:
      return "Token tidak punya izin untuk nomor/akun ini. Beri akses aset WhatsApp ke System User, lalu buat token baru.";
    case 131047:
      return "Lewat 24 jam sejak pesan terakhir pembeli. WhatsApp hanya mengizinkan pesan template di luar jendela ini.";
    case 131030:
      return "Mode uji: nomor pembeli belum didaftarkan sebagai penerima di Meta (WhatsApp › API Setup › To).";
    case 131026:
      return "Pesan tidak bisa dikirim ke nomor ini (tidak terdaftar di WhatsApp atau versi aplikasinya lama).";
    case 4:
    case 80007:
    case 130429:
    case 131056:
      return "WhatsApp sedang membatasi pengiriman. Coba lagi sebentar.";
    default:
      return code === null && message ? message : `WhatsApp menolak: ${message}`.slice(0, 280);
  }
}

const RETRYABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131056]);

export interface WhatsAppNumber {
  display_phone_number: string;
  verified_name?: string;
}

export async function whatsappNumberInfo(phoneNumberId: string, token: string, fetchFn: typeof fetch = fetch) {
  const r = await graph<WhatsAppNumber>(fetchFn, `${phoneNumberId}?fields=display_phone_number,verified_name`, { method: "GET", token });
  return r.ok ? ({ ok: true, number: r.result } as const) : ({ ok: false, error: describeWhatsAppError(r.code, r.message) } as const);
}

/** Registers WADAR's webhook on the app. Meta calls the GET handshake before this returns. */
export async function whatsappSubscribeApp(
  args: { appId: string; appSecret: string; callbackUrl: string; verifyToken: string },
  fetchFn: typeof fetch = fetch,
) {
  const r = await graph<{ success?: boolean }>(fetchFn, `${args.appId}/subscriptions`, {
    method: "POST",
    form: {
      object: "whatsapp_business_account",
      callback_url: args.callbackUrl,
      verify_token: args.verifyToken,
      fields: "messages",
      include_values: "true",
      access_token: `${args.appId}|${args.appSecret}`,
    },
  });
  if (r.ok) return { ok: true } as const;
  const hint = /callback|verify|https/i.test(r.message)
    ? "Meta tidak bisa memverifikasi alamat webhook WADAR. Pastikan WADAR dibuka dari domain https yang sudah online."
    : describeWhatsAppError(r.code, r.message);
  return { ok: false, error: hint } as const;
}

/** Lets the business account's messages reach the app (and so the webhook above). */
export async function whatsappSubscribeWaba(wabaId: string, token: string, fetchFn: typeof fetch = fetch) {
  const r = await graph<{ success?: boolean }>(fetchFn, `${wabaId}/subscribed_apps`, { method: "POST", token });
  return r.ok ? ({ ok: true } as const) : ({ ok: false, error: describeWhatsAppError(r.code, r.message) } as const);
}

/** Blue ticks for the buyer: the shop has seen the message. Best effort. */
export async function whatsappMarkRead(phoneNumberId: string, token: string, messageId: string, fetchFn: typeof fetch = fetch): Promise<void> {
  await graph(fetchFn, `${phoneNumberId}/messages`, {
    method: "POST",
    token,
    json: { messaging_product: "whatsapp", status: "read", message_id: messageId },
  }).catch(() => undefined);
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function sameToken(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function whatsappSignature(appSecret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

interface WaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
}

const IGNORED_TYPES = new Set(["reaction", "system", "request_welcome", "ephemeral"]);

function messageText(m: WaMessage): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "image":
      return m.image?.caption ?? "";
    case "video":
      return m.video?.caption ?? "";
    case "document":
      return m.document?.caption ?? "";
    default:
      return "";
  }
}

export function whatsappAdapter(fetchFn: typeof fetch = fetch): ChannelAdapter {
  return {
    kind: "whatsapp",

    async verifyWebhook(req: WebhookRequest, credentials: ChannelCredentials): Promise<VerifyResult> {
      if (req.method === "GET") {
        const ok = req.query["hub.mode"] === "subscribe" && sameToken(req.query["hub.verify_token"], credentials.verify_token);
        return ok ? { kind: "challenge", body: req.query["hub.challenge"] ?? "" } : { kind: "rejected", reason: "verify token" };
      }
      const header = req.headers["x-hub-signature-256"] ?? "";
      const given = header.startsWith("sha256=") ? header.slice(7) : "";
      const expected = credentials.app_secret ? whatsappSignature(credentials.app_secret, req.rawBody).slice(7) : "";
      return given && expected && timingSafeEqualHex(given, expected) ? { kind: "ok" } : { kind: "rejected", reason: "signature" };
    },

    parseInbound(rawBody: string): InboundMessage[] {
      let payload: {
        object?: string;
        entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: WaMessage[] } }[] }[];
      };
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return [];
      }
      if (payload?.object !== "whatsapp_business_account") return [];
      const out: InboundMessage[] = [];
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== "messages" || !change.value) continue;
          const v = change.value;
          const names = new Map((v.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]));
          for (const m of v.messages ?? []) {
            if (!m.from || !m.id || !/^\d{5,20}$/.test(m.from) || IGNORED_TYPES.has(m.type ?? "")) continue;
            const text = messageText(m).trim();
            const seconds = Number(m.timestamp);
            out.push({
              externalMessageId: m.id,
              externalUserId: m.from,
              displayName: names.get(m.from) ?? null,
              text,
              receivedAt: new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now()).toISOString(),
              recipientId: v.metadata?.phone_number_id,
              ...(text ? {} : { unsupported: true }),
            });
          }
        }
      }
      return out;
    },

    async sendText(to: string, text: string, credentials: ChannelCredentials): Promise<SendResult> {
      const r = await graph<{ messages?: { id?: string }[] }>(fetchFn, `${credentials.phone_number_id}/messages`, {
        method: "POST",
        token: credentials.access_token,
        json: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text.slice(0, MAX_TEXT) } },
      });
      if (r.ok) return { ok: true, externalMessageId: r.result.messages?.[0]?.id ?? "" };
      const retryable = r.status === 0 || r.status >= 500 || (r.code !== null && RETRYABLE_CODES.has(r.code));
      return { ok: false, retryable, reason: describeWhatsAppError(r.code, r.message) };
    },
  };
}
