import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ChannelAdapter, ChannelCredentials, InboundMessage, SendResult, VerifyResult, WebhookRequest } from "./adapter";

/**
 * Telegram Bot API connector (ADR-004). The owner pastes the bot token from @BotFather; WADAR checks
 * it (getMe), points the bot's webhook at /api/channels/telegram/<connection id> with a random
 * secret token, and from then on every private message to the bot is answered by the shop's
 * assistant. Only private chats are handled: in a group the bot would answer strangers' banter.
 */
export const TELEGRAM_API = "https://api.telegram.org";
/** Telegram's own limit per message. */
const MAX_TEXT = 4096;

export const TelegramConnectInput = z.object({
  bot_token: z
    .string()
    .trim()
    .regex(/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/, "Token bot tidak dikenali. Salin utuh dari @BotFather, bentuknya 123456789:AAH…"),
});

/** What is sealed in `channel_connections.secret_cipher` for a Telegram bot. */
export interface TelegramSecrets {
  bot_token: string;
  /** Sent by Telegram in X-Telegram-Bot-Api-Secret-Token on every webhook call. */
  webhook_secret: string;
}

export function newWebhookSecret(): string {
  // Telegram allows A-Z a-z 0-9 _ - up to 256 characters.
  return randomBytes(32).toString("base64url");
}

export interface TelegramBot {
  id: number;
  username: string;
  first_name: string;
}

export interface TelegramWebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
  last_error_date?: number;
}

type ApiResult<T> = { ok: true; result: T } | { ok: false; status: number; description: string; retryAfter?: number };

async function call<T>(fetchFn: typeof fetch, token: string, method: string, body: unknown = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchFn(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, status: 0, description: timeout ? "Telegram tidak menjawab (timeout)." : "Tidak bisa menghubungi Telegram." };
  }
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } }
    | null;
  if (res.ok && json?.ok) return { ok: true, result: json.result as T };
  return { ok: false, status: res.status, description: json?.description ?? `HTTP ${res.status}`, retryAfter: json?.parameters?.retry_after };
}

/** Telegram's error text → what the owner can act on. */
export function describeTelegramError(status: number, description: string): string {
  if (status === 401 || status === 404) return "Token bot salah atau sudah diganti. Ambil token terbaru di @BotFather (/mybots › API Token).";
  if (/HTTPS URL must be provided|bad webhook/i.test(description)) {
    return "Telegram butuh alamat https yang bisa diakses publik. Buka WADAR dari domain yang sudah online, bukan localhost.";
  }
  if (status === 429) return "Telegram sedang membatasi permintaan. Coba lagi sebentar.";
  if (status === 0) return description;
  return `Telegram menolak: ${description}`.slice(0, 280);
}

export async function telegramGetMe(token: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; bot: TelegramBot } | { ok: false; error: string }> {
  const r = await call<TelegramBot>(fetchFn, token, "getMe");
  return r.ok ? { ok: true, bot: r.result } : { ok: false, error: describeTelegramError(r.status, r.description) };
}

export async function telegramSetWebhook(token: string, url: string, secret: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await call<boolean>(fetchFn, token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
    max_connections: 20,
  });
  return r.ok ? { ok: true } : { ok: false, error: describeTelegramError(r.status, r.description) };
}

export async function telegramDeleteWebhook(token: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  return (await call<boolean>(fetchFn, token, "deleteWebhook", { drop_pending_updates: false })).ok;
}

export async function telegramWebhookInfo(token: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; info: TelegramWebhookInfo } | { ok: false; error: string }> {
  const r = await call<TelegramWebhookInfo>(fetchFn, token, "getWebhookInfo");
  return r.ok ? { ok: true, info: r.result } : { ok: false, error: describeTelegramError(r.status, r.description) };
}

/** "…sedang mengetik" while the assistant thinks. Best effort: a failure changes nothing. */
export async function telegramTyping(token: string, chatId: string, fetchFn: typeof fetch = fetch): Promise<void> {
  await call(fetchFn, token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
}

function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

interface TgMessage {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: { id?: number; type?: string };
  from?: { first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
}

export function telegramAdapter(fetchFn: typeof fetch = fetch): ChannelAdapter {
  return {
    kind: "telegram",

    async verifyWebhook(req: WebhookRequest, credentials: ChannelCredentials): Promise<VerifyResult> {
      if (req.method !== "POST") return { kind: "rejected", reason: "method" };
      return sameSecret(req.headers["x-telegram-bot-api-secret-token"], credentials.webhook_secret)
        ? { kind: "ok" }
        : { kind: "rejected", reason: "secret token" };
    },

    parseInbound(rawBody: string): InboundMessage[] {
      let update: { message?: TgMessage } | null;
      try {
        update = JSON.parse(rawBody) as { message?: TgMessage };
      } catch {
        return [];
      }
      const m = update?.message;
      if (!m || m.chat?.type !== "private" || typeof m.chat.id !== "number" || typeof m.message_id !== "number" || m.from?.is_bot) return [];
      const text = (m.text ?? m.caption ?? "").trim();
      const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ").trim() || m.from?.username || null;
      return [
        {
          externalMessageId: `${m.chat.id}:${m.message_id}`,
          externalUserId: String(m.chat.id),
          displayName: name,
          text,
          receivedAt: new Date((m.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          ...(text ? {} : { unsupported: true }),
        },
      ];
    },

    async sendText(to: string, text: string, credentials: ChannelCredentials): Promise<SendResult> {
      const r = await call<{ message_id: number }>(fetchFn, credentials.bot_token ?? "", "sendMessage", {
        chat_id: to,
        text: text.slice(0, MAX_TEXT),
        link_preview_options: { is_disabled: true },
      });
      if (r.ok) return { ok: true, externalMessageId: String(r.result.message_id) };
      if (r.status === 403) return { ok: false, retryable: false, reason: "Pembeli memblokir bot atau belum pernah memulai chat." };
      const retryable = r.status === 0 || r.status === 429 || r.status >= 500;
      return { ok: false, retryable, reason: describeTelegramError(r.status, r.description) };
    },
  };
}
