import { handleConnectorWebhook } from "@/lib/connector-webhook";

/** One model call plus a regeneration must fit after the response (see `after()` in the handler). */
export const maxDuration = 60;

/** GET /api/channels/whatsapp/<connection id> — Meta's verification handshake (hub.challenge). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleConnectorWebhook(request, id, "whatsapp");
}

/** POST /api/channels/whatsapp/<connection id> — buyer messages to the shop's number, signed by Meta (ADR-004). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleConnectorWebhook(request, id, "whatsapp");
}
