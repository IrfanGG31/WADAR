import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ChannelAdapter, ChannelCredentials, InboundMessage, SendResult, VerifyResult, WebhookRequest } from "./adapter";

/**
 * Fonnte WhatsApp gateway connector. The owner scans a QR code on fonnte.com to link their
 * WhatsApp number; WADAR receives incoming messages via Fonnte's webhook and replies through
 * their send API. No Meta Business account needed — just a regular WhatsApp number.
 *
 * Authentication: Fonnte webhooks carry no signature, so we embed a random secret token in the
 * webhook URL path and verify it on every call (same approach as Telegram's secret_token).
 *
 * API docs: https://docs.fonnte.com/api-send-message/
 * Webhook docs: https://docs.fonnte.com/webhook-reply-message/
 */

export const FONNTE_API = "https://api.fonnte.com";
const MAX_TEXT = 4096;

export const FonnteConnectInput = z.object({
  token: z
    .string()
    .trim()
    .min(10, "Token terlalu pendek. Salin token dari dashboard Fonnte (Device → token).")
    .max(400),
});

export interface FonnteSecrets {
  token: string;
  webhook_secret: string;
}

/** Fonnte incoming webhook JSON body. */
interface FonnteInbound {
  device?: string;
  sender?: string;
  message?: string;
  text?: string;
  name?: string;
  url?: string;
  filename?: string;
  extension?: string;
  timestamp?: string;
  inboxid?: string;
  member?: string;
}

function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function fonnteDescribeError(status: number, detail: string): string {
  if (status === 401) return "Token Fonnte salah atau sudah kedaluwarsa. Salin ulang dari dashboard Fonnte.";
  if (status === 0) return detail;
  return `Fonnte menolak: ${detail}`.slice(0, 280);
}

/** Validate token by calling Fonnte's device info endpoint. */
export async function fonnteValidateToken(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; device: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetchFn(`${FONNTE_API}/device`, {
      method: "POST",
      headers: { Authorization: token },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, error: timeout ? "Fonnte tidak menjawab (timeout)." : "Tidak bisa menghubungi Fonnte." };
  }
  const json = (await res.json().catch(() => null)) as { status?: boolean; device_name?: string; reason?: string } | null;
  if (res.ok && json?.status) return { ok: true, device: json.device_name ?? "device" };
  if (res.status === 401) return { ok: false, error: "Token salah. Salin ulang dari dashboard Fonnte (Device → token)." };
  return { ok: false, error: fonnteDescribeError(res.status, json?.reason ?? `HTTP ${res.status}`) };
}

export function fonnteAdapter(fetchFn: typeof fetch = fetch): ChannelAdapter {
  return {
    kind: "fonnte",

    async verifyWebhook(req: WebhookRequest, credentials: ChannelCredentials): Promise<VerifyResult> {
      if (req.method !== "POST") return { kind: "rejected", reason: "method" };
      return sameSecret(req.query.secret, credentials.webhook_secret)
        ? { kind: "ok" }
        : { kind: "rejected", reason: "secret token" };
    },

    parseInbound(rawBody: string): InboundMessage[] {
      let body: FonnteInbound | null;
      try {
        body = JSON.parse(rawBody) as FonnteInbound;
      } catch {
        return [];
      }
      if (!body || !body.sender) return [];
      const sender = String(body.sender).replace(/[^0-9@a-z]/gi, "");
      if (!sender) return [];
      const text = (body.message ?? body.text ?? "").trim();
      const name = body.name?.trim() || null;
      const ts = body.timestamp ? new Date(Number(body.timestamp) * 1000) : new Date();
      const msgId = body.inboxid ?? `${sender}:${ts.getTime()}`;
      return [
        {
          externalMessageId: msgId,
          externalUserId: sender,
          displayName: name,
          text,
          receivedAt: ts.toISOString(),
          ...(text ? {} : { unsupported: true }),
        },
      ];
    },

    async sendText(to: string, text: string, credentials: ChannelCredentials): Promise<SendResult> {
      let res: Response;
      try {
        res = await fetchFn(`${FONNTE_API}/send`, {
          method: "POST",
          headers: {
            Authorization: credentials.token ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ target: to, message: text.slice(0, MAX_TEXT) }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        return { ok: false, retryable: true, reason: timeout ? "Fonnte tidak menjawab." : "Tidak bisa menghubungi Fonnte." };
      }
      const json = (await res.json().catch(() => null)) as { status?: boolean; id?: string; reason?: string } | null;
      if (json?.status && json.id) return { ok: true, externalMessageId: json.id };
      if (json?.status) return { ok: true, externalMessageId: `fonnte-${Date.now()}` };
      const retryable = res.status === 0 || res.status === 429 || res.status >= 500;
      return { ok: false, retryable, reason: fonnteDescribeError(res.status, json?.reason ?? `HTTP ${res.status}`) };
    },
  };
}
