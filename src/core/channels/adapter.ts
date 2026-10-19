/**
 * Chat channel adapters (ADR-002). Every messaging channel — the web widget today, WhatsApp Cloud API
 * and Telegram later — is reduced to the same three steps around the one chat pipeline (`runTurn`):
 *
 *   webhook → verifyWebhook → parseInbound → (same flow as the widget: store, rate limit, runTurn) → sendText
 *
 * so connecting a channel never touches the guardrails, retrieval, or the inbox. Adapters hold no
 * secrets themselves; they get them from `ChannelCredentials`, resolved server-side per shop.
 */

export type ChatChannelKind = "whatsapp" | "telegram";

/** One message from a buyer, already normalized: the pipeline never sees provider payloads. */
export interface InboundMessage {
  /** Provider's message id — used to drop webhook retries (idempotency). */
  externalMessageId: string;
  /** Buyer id on that channel: phone number (E.164) for WhatsApp, chat id for Telegram. */
  externalUserId: string;
  displayName: string | null;
  text: string;
  receivedAt: string;
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

/** Per-shop secrets, read server-side only (never sent to the browser, never logged). */
export interface ChannelCredentials {
  [field: string]: string;
}

export interface ChannelAdapter {
  readonly kind: ChatChannelKind;
  /** Signature / token check of an incoming webhook; must be timing-safe. */
  verifyWebhook(req: WebhookRequest, credentials: ChannelCredentials): Promise<VerifyResult>;
  /** Provider payload → buyer messages (status callbacks, reactions, media without caption → []). */
  parseInbound(rawBody: string): InboundMessage[];
  /** Send a reply to one buyer. */
  sendText(to: string, text: string, credentials: ChannelCredentials): Promise<SendResult>;
}

/** Placeholder until a channel is built: refuses every webhook and every send, loudly. */
export class NotConnectedAdapter implements ChannelAdapter {
  constructor(readonly kind: ChatChannelKind) {}
  async verifyWebhook(): Promise<VerifyResult> {
    return { kind: "rejected", reason: `${this.kind} belum tersedia` };
  }
  parseInbound(): InboundMessage[] {
    return [];
  }
  async sendText(): Promise<SendResult> {
    return { ok: false, retryable: false, reason: `${this.kind} belum tersedia` };
  }
}

export const CHANNEL_ADAPTERS: Readonly<Record<ChatChannelKind, ChannelAdapter>> = {
  whatsapp: new NotConnectedAdapter("whatsapp"),
  telegram: new NotConnectedAdapter("telegram"),
};
