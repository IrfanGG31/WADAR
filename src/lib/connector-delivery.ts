import "server-only";
import { sendWithRetry } from "@/core/channels/adapter";
import { CHANNEL_NAME, channelAdapter } from "@/core/channels/registry";
import { connectorTarget, credentialsOf, recordDelivery } from "@/db/channel-connections";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConnectorDeliveryResult = { ok: true; channel: string } | { ok: false; channel: string; reason: string };

/**
 * Sends a stored outgoing message (the owner's reply from the inbox, or a resend) to the buyer's
 * Telegram/WhatsApp and records the outcome. null = not a connector chat (web widget, API bot), or
 * the server cannot deliver at all (no service role) — the message then simply stays in the inbox.
 */
export async function deliverToConnector(args: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  text: string;
  previousAttempts?: number;
}): Promise<ConnectorDeliveryResult | null> {
  let db;
  try {
    db = createAdminClient();
  } catch {
    return null;
  }
  try {
    const target = await connectorTarget(db, args.tenantId, args.conversationId);
    if (!target) return null;
    const { connection } = target;
    const delivery = await sendWithRetry(channelAdapter(connection.kind), target.to, args.text, credentialsOf(connection));
    await recordDelivery(db, {
      messageId: args.messageId,
      tenantId: args.tenantId,
      connectionId: connection.id,
      delivery,
      previousAttempts: args.previousAttempts,
    });
    const channel = CHANNEL_NAME[connection.kind];
    return delivery.ok ? { ok: true, channel } : { ok: false, channel, reason: delivery.reason };
  } catch (e) {
    // The reply is already stored; a database hiccup here must not turn it into an error page.
    console.error("connector delivery failed", e instanceof Error ? e.message : e);
    return { ok: false, channel: "Telegram/WhatsApp", reason: "Ada gangguan di server. Coba kirim ulang sebentar lagi." };
  }
}
