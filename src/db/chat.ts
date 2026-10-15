import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface InboxRow {
  id: string;
  channel: "whatsapp" | "widget";
  external_user_id: string;
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
  const { data, error } = await supabase
    .from("inbox_conversations")
    .select("id, channel, external_user_id, mode, status, escalation_reason, last_message_at, last_content, last_author")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as InboxRow[];
}

/** One conversation with its last 200 messages in arrival order, or null when it is not this shop's. */
export async function getThread(tenantId: string, conversationId: string) {
  const supabase = await createClient();
  const { data: conv, error } = await supabase
    .from("inbox_conversations")
    .select("id, channel, external_user_id, mode, status, escalation_reason, last_message_at, last_content, last_author")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conv) return null;
  const { data: msgs, error: me } = await supabase
    .from("messages")
    .select("id, direction, author, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (me) throw me;
  return { conversation: conv as InboxRow, messages: ((msgs ?? []) as ThreadMessage[]).reverse() };
}
