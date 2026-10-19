import type { WidgetResult } from "@/core/chat/widget-service";
import type { StorePersona } from "@/core/chat/store-policies";
import type { InboundMessage, SendResult } from "./adapter";

/**
 * What happens to buyer messages that arrive through a direct connector (Telegram bot, WhatsApp
 * Cloud API), after the webhook was verified: each message goes through the same chat pipeline as
 * the web widget, and every reply the buyer should see is sent back on that channel with its
 * delivery recorded. Pure orchestration over `ConnectorDeps`, so it is tested without a network.
 */
export const UNSUPPORTED_NOTE = "Maaf, aku baru bisa membaca pesan teks. Ketik pertanyaannya ya.";

export function connectorGreeting(shopName: string, persona: Pick<StorePersona, "name" | "salutation" | "emoji">): string {
  const who = persona.name ? `${persona.name} dari ${shopName}` : `asisten ${shopName}`;
  return `Halo ${persona.salutation}! Aku ${who}. Mau tanya produk, stok, ongkir, atau cara pesan? Tulis saja di sini${persona.emoji ? " 😊" : "."}`;
}

export type Delivery = SendResult & { attempts: number };

export interface ConnectorDeps {
  /** One buyer message through the chat pipeline (`handleWidgetMessage` for this shop and channel). */
  answer(message: InboundMessage): Promise<WidgetResult>;
  send(to: string, text: string): Promise<Delivery>;
  /** Delivery outcome of a reply that is a stored message (shown in the inbox). */
  recordDelivery(messageId: string, delivery: Delivery): Promise<void>;
  /** The /start greeting, or null when the shop is closed. */
  greeting(): Promise<string | null>;
  /** "typing…" / read receipt while the assistant thinks. Best effort. */
  acknowledge?(message: InboundMessage): Promise<void>;
}

export interface ConnectorOutcome {
  answered: number;
  sent: number;
  failed: number;
  /** Why the last send failed (an expired token shows up here first). */
  lastError?: string;
}

export async function processConnectorMessages(deps: ConnectorDeps, messages: readonly InboundMessage[]): Promise<ConnectorOutcome> {
  const outcome: ConnectorOutcome = { answered: 0, sent: 0, failed: 0 };
  const count = (d: Delivery) => {
    if (d.ok) outcome.sent++;
    else {
      outcome.failed++;
      outcome.lastError = d.reason;
    }
  };

  for (const message of messages) {
    const to = message.externalUserId;
    if (message.unsupported) {
      count(await deps.send(to, UNSUPPORTED_NOTE));
      continue;
    }
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(message.text)) {
      const greeting = await deps.greeting();
      if (greeting) count(await deps.send(to, greeting));
      continue;
    }
    await deps.acknowledge?.(message).catch(() => undefined);
    const result = await deps.answer(message);
    if (result.status === 404) continue; // shop closed or deleted: say nothing
    if (result.status !== 200) {
      count(await deps.send(to, result.body.error));
      continue;
    }
    outcome.answered++;
    for (const reply of result.body.messages) {
      if (reply.author === "customer") continue;
      const delivery = await deps.send(to, reply.content);
      count(delivery);
      await deps.recordDelivery(reply.id, delivery);
    }
  }
  return outcome;
}
