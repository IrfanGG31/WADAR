import "server-only";
import type { InboxChannel } from "@/core/chat/inbox";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

const INBOX_COLUMNS = "id, channel, external_user_id, mode, status, escalation_reason, last_message_at, last_content, last_author";
/** With the connector columns (migration channel_connectors); without them the inbox still works. */
const INBOX_COLUMNS_V2 = `${INBOX_COLUMNS}, display_name, customer_id`;

type InboxQuery = (columns: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

async function withConnectorColumns<T>(query: InboxQuery): Promise<T> {
  const first = await query(INBOX_COLUMNS_V2);
  if (!first.error) return first.data as T;
  if (!isSchemaPending(first.error)) throw first.error;
  const legacy = await query(INBOX_COLUMNS);
  if (legacy.error) throw legacy.error;
  return legacy.data as T;
}

export interface InboxRow {
  id: string;
  channel: InboxChannel;
  external_user_id: string;
  /** Buyer's name from Telegram/WhatsApp; null before migration channel_connectors. */
  display_name: string | null;
  customer_id: string | null;
  mode: "ai" | "human";
  status: "open" | "escalated" | "closed";
  escalation_reason: string | null;
  last_message_at: string;
  last_content: string | null;
  last_author: "customer" | "ai" | "human" | "system" | null;
}

export interface ThreadMessage {
  id: string;
  direction: "in" | "out";
  author: "customer" | "ai" | "human" | "system";
  content: string | null;
  created_at: string;
}

/** The shop's conversations, newest first. Read as the signed-in user (RLS), from `inbox_conversations`. */
export async function listInbox(tenantId: string): Promise<InboxRow[]> {
  const supabase = await createClient();
  const rows = await withConnectorColumns<InboxRow[] | null>((columns) =>
    supabase
      .from("inbox_conversations")
      .select(columns)
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
  );
  return (rows ?? []).map((r) => ({ ...r, display_name: r.display_name ?? null, customer_id: r.customer_id ?? null }));
}

/** One conversation with its last 200 messages in arrival order, or null when it is not this shop's. */
export async function getThread(tenantId: string, conversationId: string) {
  const supabase = await createClient();
  const conv = await withConnectorColumns<InboxRow | null>((columns) =>
    supabase.from("inbox_conversations").select(columns).eq("tenant_id", tenantId).eq("id", conversationId).maybeSingle(),
  );
  if (!conv) return null;
  const { data: msgs, error: me } = await supabase
    .from("messages")
    .select("id, direction, author, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (me) throw me;
  return {
    conversation: { ...conv, display_name: conv.display_name ?? null, customer_id: conv.customer_id ?? null },
    messages: ((msgs ?? []) as ThreadMessage[]).reverse(),
  };
}
