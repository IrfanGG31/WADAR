import { isValidSessionId } from "@/core/chat/widget";
import { createAdminClient } from "@/lib/supabase/admin";
import { WIDGET_COOKIE } from "../session";

/**
 * GET /api/widget/<slug>/stream?after=<created_at> — Server-Sent Events with the
 * messages the buyer should see (AI, admin, system), oldest first. The event id
 * is the message's created_at, so a reconnect (Last-Event-ID) resumes exactly.
 * One connection lives ~25 s; EventSource reconnects by itself.
 */
export const maxDuration = 30;

const POLL_MS = 1500;
const LIFETIME_MS = 25_000;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionId = cookieHeader.match(new RegExp(`(?:^|;\\s*)${WIDGET_COOKIE}=([^;]+)`))?.[1];
  if (!isValidSessionId(sessionId)) return new Response("sesi tidak ada", { status: 401 });

  const db = createAdminClient();
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) return new Response("toko tidak ditemukan", { status: 404 });
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("channel", "widget")
    .eq("external_user_id", sessionId)
    .maybeSingle();

  const url = new URL(request.url);
  let cursor = request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "";
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      send("retry: 2000\n\n");
      try {
        while (!request.signal.aborted && Date.now() - started < LIFETIME_MS && conv) {
          let query = db
            .from("messages")
            .select("id, author, content, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true })
            .limit(50);
          if (cursor) query = query.gt("created_at", cursor);
          const { data, error } = await query;
          if (error) throw error;
          for (const m of data ?? []) {
            cursor = m.created_at as string;
            send(`id: ${cursor}\nevent: message\ndata: ${JSON.stringify(m)}\n\n`);
          }
          if (!data?.length) send(": ping\n\n");
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (error) {
        console.error("widget stream failed", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
