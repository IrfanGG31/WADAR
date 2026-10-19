import type { ChannelAdapter, ChatChannelKind } from "./adapter";
import { telegramAdapter } from "./telegram";
import { whatsappAdapter } from "./whatsapp";

/** The adapter of a direct connector kind (ADR-004). */
export function channelAdapter(kind: ChatChannelKind, fetchFn: typeof fetch = fetch): ChannelAdapter {
  return kind === "telegram" ? telegramAdapter(fetchFn) : whatsappAdapter(fetchFn);
}

export const CHANNEL_NAME: Readonly<Record<ChatChannelKind, string>> = { telegram: "Telegram", whatsapp: "WhatsApp" };
