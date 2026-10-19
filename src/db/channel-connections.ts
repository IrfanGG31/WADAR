import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelCredentials, ChatChannelKind } from "@/core/channels/adapter";
import type { Delivery } from "@/core/channels/connector-service";
import { openSecret } from "@/lib/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

export type ConnectionStatus = "pending" | "active" | "error";

/** What the owner's settings page shows of a connector (RLS: owner only; no secrets). */
export interface ChannelConnectionView {
  id: string;
  kind: ChatChannelKind;
  label: string;
  settings: Record<string, string>;
  secret_hint: string;
  status: ConnectionStatus;
  last_error: string | null;
  last_event_at: string | null;
  updated_at: string;
}

/** The shop's connectors; `installed` is false while migration channel_connectors is not applied. */
export async function listChannelConnections(tenantId: string): Promise<{ installed: boolean; connections: ChannelConnectionView[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_connections")
    .select("id, kind, label, settings, secret_hint, status, last_error, last_event_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("kind");
  if (error) {
    if (isSchemaPending(error)) return { installed: false, connections: [] };
    throw error;
  }
  return { installed: true, connections: (data ?? []) as ChannelConnectionView[] };
}

/** A connector with its decrypted secrets — server only, read with the service role. */
export interface LoadedConnection {
  id: string;
  tenantId: string;
  slug: string;
  kind: ChatChannelKind;
  label: string;
  settings: Record<string, string>;
  secrets: Record<string, string>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The connector behind a webhook URL or a connector chat. null when unknown, of another kind, or
 * its secrets can no longer be decrypted (encryption key changed: the owner reconnects).
 */
export async function loadConnection(db: SupabaseClient, id: string, kind?: ChatChannelKind): Promise<LoadedConnection | null> {
  if (!UUID_RE.test(id)) return null;
  let query = db.from("channel_connections").select("id, tenant_id, kind, label, settings, secret_cipher, tenants!inner(slug)").eq("id", id);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isSchemaPending(error)) return null;
    throw error;
  }
  if (!data) return null;
  let secrets: Record<string, string>;
  try {
    secrets = JSON.parse(openSecret(data.secret_cipher as string)) as Record<string, string>;
  } catch {
    console.error("connector secrets unreadable", data.id);
    return null;
  }
  const tenant = data.tenants as unknown as { slug: string };
  return {
    id: data.id as string,
    tenantId: data.tenant_id as string,
    slug: tenant.slug,
    kind: data.kind as ChatChannelKind,
    label: data.label as string,
    settings: (data.settings ?? {}) as Record<string, string>,
    secrets,
  };
}

/** Everything an adapter needs to send: the ids in `settings` plus the decrypted secrets. */
export function credentialsOf(connection: LoadedConnection): ChannelCredentials {
  const ids = Object.fromEntries(Object.entries(connection.settings).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return { ...ids, ...connection.secrets };
}

/** A webhook arrived (or failed): the settings page shows when the channel last spoke. */
export async function markConnectionEvent(db: SupabaseClient, id: string, patch: { status?: ConnectionStatus; error?: string | null } = {}) {
  const row: Record<string, unknown> = { last_event_at: new Date().toISOString() };
  if (patch.status) {
    row.status = patch.status;
    row.last_error = patch.status === "error" ? (patch.error ?? "").slice(0, 300) : null;
  }
  const { error } = await db.from("channel_connections").update(row).eq("id", id);
  if (error) console.error("connector event not recorded", error.code);
}

export async function recordDelivery(
  db: SupabaseClient,
  args: { messageId: string; tenantId: string; connectionId: string; delivery: Delivery; previousAttempts?: number },
): Promise<void> {
  const d = args.delivery;
  const { error } = await db.from("message_deliveries").upsert(
    {
      message_id: args.messageId,
      tenant_id: args.tenantId,
      connection_id: args.connectionId,
      status: d.ok ? "sent" : "failed",
      attempts: Math.min(1000, (args.previousAttempts ?? 0) + d.attempts),
      external_id: d.ok ? d.externalMessageId.slice(0, 200) || null : null,
      last_error: d.ok ? null : d.reason.slice(0, 300),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id" },
  );
  if (error && !isSchemaPending(error)) console.error("delivery not recorded", error.code);
}

/**
 * Where a reply in this conversation has to go: its connector and the buyer's id there. null for
 * web-widget and API-bot chats (the bot fetches replies itself), or before channel_connectors.
 */
export async function connectorTarget(db: SupabaseClient, tenantId: string, conversationId: string): Promise<{ connection: LoadedConnection; to: string } | null> {
  const { data, error } = await db
    .from("conversations")
    .select("connection_id, external_user_id")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    if (isSchemaPending(error)) return null;
    throw error;
  }
  if (!data?.connection_id) return null;
  const connection = await loadConnection(db, data.connection_id as string);
  return connection && connection.tenantId === tenantId ? { connection, to: data.external_user_id as string } : null;
}

export interface DeliveryView {
  status: "sent" | "failed";
  last_error: string | null;
}

/** Delivery state per message of one conversation (RLS: members). Empty before channel_connectors. */
export async function getDeliveries(messageIds: readonly string[]): Promise<Map<string, DeliveryView>> {
  if (messageIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("message_deliveries").select("message_id, status, last_error").in("message_id", messageIds);
  if (error) {
    if (isSchemaPending(error)) return new Map();
    throw error;
  }
  return new Map((data ?? []).map((d) => [d.message_id as string, { status: d.status as DeliveryView["status"], last_error: d.last_error as string | null }]));
}

/** The WhatsApp verify token, for the "isi manual di Meta" box on the owner's settings page. */
export async function whatsappVerifyToken(connectionId: string): Promise<string | null> {
  try {
    return (await loadConnection(createAdminClient(), connectionId, "whatsapp"))?.secrets.verify_token ?? null;
  } catch {
    return null;
  }
}

