import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { PRIVATE_HOST } from "./channels/ai-provider";

/**
 * Webhook keluar (ADR-007): events WADAR sends to the owner's own apps (n8n, Make, Zapier, a
 * server). Signed like Stripe: `X-Wadar-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`,
 * so the receiver can check the sender and refuse replays.
 */
export const WEBHOOK_EVENTS = ["sale.created", "sale.voided", "purchase.received", "chat.needs_owner"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  "sale.created": "Penjualan baru",
  "sale.voided": "Penjualan dibatalkan",
  "purchase.received": "Barang dari pemasok datang",
  "chat.needs_owner": "Chat perlu dibalas pemilik",
};

export function webhookUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Alamat belum benar. Contoh: https://hooks.zapier.com/…";
  }
  if (url.protocol !== "https:") return "Alamat harus diawali https://";
  if (url.username || url.password) return "Jangan taruh kata sandi di alamat.";
  if (PRIVATE_HOST.some((re) => re.test(url.hostname))) return "Alamat internal/IP tidak diizinkan.";
  return null;
}

export const WebhookInput = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Isi alamat webhook.")
    .max(500)
    .superRefine((v, ctx) => {
      const problem = webhookUrlProblem(v);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pilih minimal satu kejadian."),
});

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhook(secret: string, body: string, unixSeconds: number): string {
  const v1 = createHmac("sha256", secret).update(`${unixSeconds}.${body}`).digest("hex");
  return `t=${unixSeconds},v1=${v1}`;
}

/** Wait before attempt n+1 (after n failures); null = give up. ~1 day of retries in total. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
export function nextAttemptDelay(failures: number): number | null {
  return failures >= 1 && failures <= BACKOFF_MS.length ? (BACKOFF_MS[failures - 1] as number) : null;
}

/** The JSON body WADAR posts. */
export function webhookBody(event: { id: string; type: string; created_at: string; payload: Record<string, unknown> }, shopSlug: string): string {
  return JSON.stringify({ id: event.id, type: event.type, created_at: event.created_at, shop: shopSlug, data: event.payload });
}
