import { handleConnectorWebhook } from "@/lib/connector-webhook";

/** One model call plus a regeneration must fit after the response (see `after()` in the handler). */
export const maxDuration = 60;

/** POST /api/channels/telegram/<connection id> — Telegram's webhook for the shop's bot (ADR-004). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleConnectorWebhook(request, id, "telegram");
}
