/**
 * Chat channel adapters (ADR-002, ADR-004). Every messaging channel — the web widget, a Telegram bot,
 * a WhatsApp Cloud API number — is reduced to the same three steps around the one chat pipeline
 * (`runTurn`):
 *
 *   webhook → verifyWebhook → parseInbound → (same flow as the widget: store, rate limit, runTurn) → sendText
 *
 * so connecting a channel never touches the guardrails, retrieval, or the inbox. Adapters hold no
 * secrets themselves; they get them from `ChannelCredentials`, resolved server-side per shop.
 */

export type ChatChannelKind = "whatsapp" | "telegram" | "fonnte";

/** One message from a buyer, already normalized: the pipeline never sees provider payloads. */
export interface InboundMessage {
  /** Provider's message id — used to drop webhook retries (idempotency). */
  externalMessageId: string;
  /** Buyer id on that channel: WhatsApp id (country code + number, digits) or Telegram chat id. */
  externalUserId: string;
  displayName: string | null;
  text: string;
  receivedAt: string;
  /** The shop-side account the message was sent to (WhatsApp phone number id), when the provider says. */
  recipientId?: string;
  /** A photo/sticker/voice note without words: the assistant cannot read it, the buyer gets a short note. */
  unsupported?: boolean;
}

export interface WebhookRequest {
  method: string;
  headers: Readonly<Record<string, string | undefined>>;
  query: Readonly<Record<string, string | undefined>>;
  rawBody: string;
}

export type VerifyResult =
  /** Provider handshake (WhatsApp GET hub.challenge): answer with this body, nothing else to do. */
  | { kind: "challenge"; body: string }
  | { kind: "ok" }
  | { kind: "rejected"; reason: string };

export type SendResult = { ok: true; externalMessageId: string } | { ok: false; retryable: boolean; reason: string };

/** Per-shop secrets and ids, read server-side only (never sent to the browser, never logged). */
export interface ChannelCredentials {
  [field: string]: string;
}

export interface ChannelAdapter {
  readonly kind: ChatChannelKind;
  /** Signature / token check of an incoming webhook; must be timing-safe. */
  verifyWebhook(req: WebhookRequest, credentials: ChannelCredentials): Promise<VerifyResult>;
  /** Provider payload → buyer messages (status callbacks, reactions, group chats → []). */
  parseInbound(rawBody: string): InboundMessage[];
  /** Send a reply to one buyer. */
  sendText(to: string, text: string, credentials: ChannelCredentials): Promise<SendResult>;
}

/** Placeholder for a channel that is not configured: refuses every webhook and every send, loudly. */
export class NotConnectedAdapter implements ChannelAdapter {
  constructor(readonly kind: ChatChannelKind) {}
  async verifyWebhook(): Promise<VerifyResult> {
    return { kind: "rejected", reason: `${this.kind} belum tersambung` };
  }
  parseInbound(): InboundMessage[] {
    return [];
  }
  async sendText(): Promise<SendResult> {
    return { ok: false, retryable: false, reason: `${this.kind} belum tersambung` };
  }
}

/** Sends once more after a short pause when the provider says "try again" (rate limit, 5xx, timeout). */
export async function sendWithRetry(
  adapter: ChannelAdapter,
  to: string,
  text: string,
  credentials: ChannelCredentials,
  { attempts = 2, pauseMs = 800 }: { attempts?: number; pauseMs?: number } = {},
): Promise<SendResult & { attempts: number }> {
  let result: SendResult = { ok: false, retryable: true, reason: "belum dicoba" };
  for (let i = 1; i <= attempts; i++) {
    result = await adapter.sendText(to, text, credentials);
    if (result.ok || !result.retryable || i === attempts) return { ...result, attempts: i };
    await new Promise((r) => setTimeout(r, pauseMs * i));
  }
  return { ...result, attempts };
}
