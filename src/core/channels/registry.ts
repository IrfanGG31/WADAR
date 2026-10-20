import type { ChannelAdapter, ChatChannelKind } from "./adapter";
import { fonnteAdapter } from "./fonnte";
import { telegramAdapter } from "./telegram";
import { whatsappAdapter } from "./whatsapp";

/** The adapter of a direct connector kind (ADR-004). */
export function channelAdapter(kind: ChatChannelKind, fetchFn: typeof fetch = fetch): ChannelAdapter {
  if (kind === "telegram") return telegramAdapter(fetchFn);
  if (kind === "fonnte") return fonnteAdapter(fetchFn);
  return whatsappAdapter(fetchFn);
}

export const CHANNEL_NAME: Readonly<Record<ChatChannelKind, string>> = { telegram: "Telegram", whatsapp: "WhatsApp", fonnte: "WA (Fonnte)" };
