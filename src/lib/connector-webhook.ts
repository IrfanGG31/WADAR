import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { getQueryEmbedder } from "@/ai";
import { chatGenerator } from "@/ai/chat-generator";
import { sendWithRetry, type ChannelAdapter, type ChatChannelKind, type InboundMessage } from "@/core/channels/adapter";
import { connectorGreeting, processConnectorMessages } from "@/core/channels/connector-service";
import { channelAdapter } from "@/core/channels/registry";
import { telegramTyping } from "@/core/channels/telegram";
import { whatsappMarkRead } from "@/core/channels/whatsapp";
import { handleWidgetMessage } from "@/core/chat/widget-service";
import { credentialsOf, loadConnection, markConnectionEvent, recordDelivery, type LoadedConnection } from "@/db/channel-connections";
import { linkChatToCustomer } from "@/db/customers-link";
import { supabaseWidgetStore } from "@/db/widget-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantAi } from "@/lib/tenant-ai";

/**
 * One webhook call from Telegram or Meta for connector `id` (ADR-004): verify (secret token /
 * signature / GET handshake), answer 200 at once, then run the buyer messages through the chat
 * pipeline after the response — providers retry slow webhooks, and a retried message is stored once.
 */
const MAX_BODY_BYTES = 512 * 1024;

export async function handleConnectorWebhook(request: Request, id: string, kind: ChatChannelKind): Promise<Response> {
  let db;
  try {
    db = createAdminClient();
  } catch {
    return new Response("Not configured", { status: 503 });
  }
  // Provider payloads are a few KB; anything huge is not from Telegram or Meta.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response("Too large", { status: 413 });
  const connection = await loadConnection(db, id, kind);
  if (!connection) return new Response("Not found", { status: 404 });

  const rawBody = request.method === "POST" ? await request.text() : "";
  const adapter = channelAdapter(kind);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const credentials = credentialsOf(connection);
  const verdict = await adapter.verifyWebhook(
    { method: request.method, headers, query: Object.fromEntries(new URL(request.url).searchParams), rawBody },
    credentials,
  );
  if (verdict.kind === "rejected") return new Response("Forbidden", { status: 403 });
  if (verdict.kind === "challenge") {
    await markConnectionEvent(db, connection.id);
    return new Response(verdict.body, { headers: { "content-type": "text/plain" } });
  }

  // One Meta app can serve several numbers: only messages to this shop's number count.
  const messages = adapter
    .parseInbound(rawBody)
    .filter((m) => kind !== "whatsapp" || !m.recipientId || m.recipientId === connection.settings.phone_number_id);
  if (messages.length === 0) return new Response("ok");

  after(async () => {
    try {
      const outcome = await answerConnectorMessages(connection, adapter, messages);
      // Messages arrive but nothing goes out (expired token, number blocked): the settings page says why.
      const broken = outcome.failed > 0 && outcome.sent === 0;
      await markConnectionEvent(db, connection.id, broken ? { status: "error", error: outcome.lastError } : { status: "active" });
    } catch (e) {
      console.error("connector turn failed", kind, e instanceof Error ? e.message : e);
    }
  });
  return new Response("ok");
}

async function answerConnectorMessages(connection: LoadedConnection, adapter: ChannelAdapter, messages: InboundMessage[]) {
  const db = createAdminClient();
  const store = supabaseWidgetStore(db, { embedQuery: getQueryEmbedder() });
  const generator = { forTenant: async (tenantId: string) => chatGenerator(await getTenantAi(tenantId)) };
  const credentials = credentialsOf(connection);
  const token = connection.kind === "telegram" ? connection.secrets.bot_token : connection.secrets.access_token;

  return processConnectorMessages(
    {
      answer: async (m) => {
        const result = await handleWidgetMessage(store, generator, {
          slug: connection.slug,
          sessionId: m.externalUserId,
          channel: connection.kind,
          connector: { connectionId: connection.id, displayName: m.displayName },
          ip: null,
          body: { text: m.text, client_id: createHash("sha256").update(m.externalMessageId).digest("hex").slice(0, 32) },
          now: new Date(),
        });
        if (connection.kind === "whatsapp" && result.status === 200 && !result.body.duplicate) {
          await linkChatToCustomer(db, connection.tenantId, "whatsapp", m.externalUserId).catch(() => undefined);
        }
        return result;
      },
      send: (to, text) => sendWithRetry(adapter, to, text, credentials),
      recordDelivery: (messageId, delivery) =>
        recordDelivery(db, { messageId, tenantId: connection.tenantId, connectionId: connection.id, delivery }),
      greeting: async () => {
        const shop = await store.findShop(connection.slug);
        return shop ? connectorGreeting(shop.name, shop.persona) : null;
      },
      acknowledge: (m) =>
        connection.kind === "telegram"
          ? telegramTyping(token ?? "", m.externalUserId)
          : whatsappMarkRead(credentials.phone_number_id ?? "", token ?? "", m.externalMessageId),
    },
    messages,
  );
}
