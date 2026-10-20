import { handleConnectorWebhook } from "@/lib/connector-webhook";

export const maxDuration = 60;

/** POST /api/channels/fonnte/<connection id>?secret=<token> — Fonnte's webhook for incoming WA messages. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleConnectorWebhook(request, id, "fonnte");
}
