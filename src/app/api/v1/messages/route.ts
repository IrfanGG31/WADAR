import { createHash } from "node:crypto";
import { z } from "zod";
import { getQueryEmbedder } from "@/ai";
import { chatGenerator } from "@/ai/chat-generator";
import { isValidExternalUserId, handleWidgetMessage } from "@/core/chat/widget-service";
import { clientIp } from "@/core/rate-limit";
import { isChannelPending, isSchemaPending } from "@/db/schema-pending";
import { linkChatToCustomer } from "@/db/customers-link";
import { supabaseWidgetStore } from "@/db/widget-store";
import { apiError, readJson, withApiKey } from "@/lib/api-v1";
import { getTenantAi } from "@/lib/tenant-ai";

export const maxDuration = 60;

const Inbound = z.object({
  /** Buyer id on that channel: WhatsApp number (e.g. +6281…), Telegram chat id, any stable id. */
  from: z.string().trim().refine(isValidExternalUserId, "from: huruf/angka/+:_.@- maks 80"),
  text: z.string().trim().min(1, "text kosong.").max(500, "text maksimal 500 huruf."),
  /** The sender app's message id; a retry with the same id is stored once. */
  message_id: z.string().trim().min(1).max(200),
  channel: z.enum(["whatsapp", "telegram", "api"]).default("api"),
});

/**
 * POST /api/v1/messages — a buyer message forwarded by your WhatsApp/Telegram bot or any app.
 * Answered by the same pipeline as the web chat (store data only, guardrails on, escalation to
 * the inbox). Reply with `reply` to the buyer; when `mode` is "human" the owner answers from the
 * inbox and your bot picks that up with GET.
 */
export function POST(request: Request) {
  return withApiKey(request, "messages:write", async ({ caller, db }) => {
    const parsed = Inbound.safeParse(await readJson(request));
    if (!parsed.success) return apiError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Isi permintaan tidak valid.");
    const { from, text, message_id, channel } = parsed.data;
    const clientId = createHash("sha256").update(message_id).digest("hex").slice(0, 32);
    let result;
    try {
      result = await handleWidgetMessage(
        supabaseWidgetStore(db, { embedQuery: getQueryEmbedder() }),
        { forTenant: async (tenantId) => chatGenerator(await getTenantAi(tenantId)) },
        { slug: caller.slug, sessionId: from, channel, ip: clientIp(request.headers), body: { text, client_id: clientId }, now: new Date() },
      );
    } catch (e) {
      if (!isChannelPending(e)) throw e;
      return apiError(503, "channel_pending", `Kanal "${channel}" menunggu pembaruan database WADAR. Sementara kirim dengan "channel": "whatsapp".`);
    }
    if (result.status !== 200) return apiError(result.status, result.status === 429 ? "rate_limited" : "rejected", result.body.error, result.body);
    if (channel === "whatsapp" && !result.body.duplicate) await linkChatToCustomer(db, caller.tenantId, "whatsapp", from).catch(() => undefined);
    const reply = result.body.messages
      .filter((m) => m.author !== "customer")
      .map((m) => m.content)
      .join("\n\n");
    return Response.json({ reply: reply || null, mode: result.body.mode, duplicate: result.body.duplicate ?? false });
  });
}

/**
 * GET /api/v1/messages?since=<ISO time> — replies to deliver: what the owner (or the AI) wrote to
 * buyers on outside channels after `since`, oldest first, max 100. Poll every few seconds.
 */
export function GET(request: Request) {
  return withApiKey(request, "messages:write", async ({ caller, db }) => {
    const sinceRaw = new URL(request.url).searchParams.get("since");
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Chats of a direct connector (Pusat Koneksi › Telegram/WhatsApp) are answered by WADAR itself.
    const query = (skipConnectorChats: boolean) => {
      let q = db
        .from("messages")
        .select("id, content, author, created_at, conversations!messages_conversation_id_fkey!inner(channel, external_user_id)")
        .eq("tenant_id", caller.tenantId)
        .eq("direction", "out")
        .eq("author", "human")
        .in("conversations.channel", ["whatsapp", "telegram", "api"]);
      if (skipConnectorChats) q = q.is("conversations.connection_id", null);
      return q.gt("created_at", since).order("created_at").limit(100);
    };
    let { data, error } = await query(true);
    if (isSchemaPending(error)) ({ data, error } = await query(false));
    if (error) throw error;
    const messages = (data ?? []).map((m) => {
      const c = m.conversations as unknown as { channel: string; external_user_id: string };
      return { id: m.id, to: c.external_user_id, channel: c.channel, text: m.content, author: m.author, created_at: m.created_at };
    });
    return Response.json({ messages, next_since: messages.at(-1)?.created_at ?? since });
  });
}
