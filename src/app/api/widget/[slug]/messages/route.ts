import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getQueryEmbedder } from "@/ai";
import { chatGenerator } from "@/ai/chat-generator";
import { clientIp } from "@/core/rate-limit";
import { isValidSessionId } from "@/core/chat/widget";
import { handleWidgetMessage } from "@/core/chat/widget-service";
import { supabaseWidgetStore } from "@/db/widget-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantAi } from "@/lib/tenant-ai";
import { WIDGET_COOKIE, WIDGET_COOKIE_OPTIONS } from "../session";

/** One model call plus a regeneration must fit; the default limit can cut a slow answer off. */
export const maxDuration = 60;

/** POST /api/widget/<slug>/messages — one buyer message; answers through the shared chat pipeline. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const existing = cookieHeader.match(new RegExp(`(?:^|;\\s*)${WIDGET_COOKIE}=([^;]+)`))?.[1];
  const sessionId = isValidSessionId(existing) ? existing : randomBytes(18).toString("base64url");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pesan tidak valid." }, { status: 400 });
  }

  try {
    const generate = { forTenant: async (tenantId: string) => chatGenerator(await getTenantAi(tenantId)) };
    const result = await handleWidgetMessage(supabaseWidgetStore(createAdminClient(), { embedQuery: getQueryEmbedder() }), generate, {
      slug,
      sessionId,
      ip: clientIp(request.headers),
      body,
      now: new Date(),
    });
    const res = NextResponse.json(result.body, {
      status: result.status,
      headers: result.status === 429 ? { "Retry-After": String(result.body.retryAfterSeconds ?? 60) } : undefined,
    });
    if (existing !== sessionId) res.cookies.set(WIDGET_COOKIE, sessionId, WIDGET_COOKIE_OPTIONS);
    return res;
  } catch (error) {
    console.error("widget message failed", error);
    return NextResponse.json({ error: "Maaf, ada gangguan. Coba kirim lagi sebentar lagi ya." }, { status: 500 });
  }
}
