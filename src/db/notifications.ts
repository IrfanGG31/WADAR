import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPrefs, NotifyDeps } from "@/core/notify";
import { createClient } from "@/lib/supabase/server";
import { sendWebPush, type VapidConfig } from "@/lib/web-push";

/** GAP #7. Writes go through the service role (widget route); the owner's pages read with RLS. */
export function supabaseNotifyDeps(db: SupabaseClient, vapid: VapidConfig | null): NotifyDeps {
  return {
    async loadPrefs(tenantId) {
      const { data, error } = await db.from("notification_prefs").select("on_escalation, push_enabled").eq("tenant_id", tenantId).maybeSingle();
      if (error) throw error;
      return (data as NotificationPrefs | null) ?? null;
    },
    async insertNotification(row) {
      const { error } = await db.from("notifications").insert(row);
      if (error) throw error;
    },
    async listPushSubscriptions(tenantId) {
      const { data, error } = await db.from("push_subscriptions").select("id, endpoint").eq("tenant_id", tenantId).limit(20);
      if (error) throw error;
      return (data ?? []) as { id: string; endpoint: string }[];
    },
    async removePushSubscription(id) {
      const { error } = await db.from("push_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    sendPush: vapid ? (sub) => sendWebPush(sub, vapid) : undefined,
  };
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  conversation_id: string | null;
  created_at: string;
}

/**
 * Unread notifications of a shop, newest first. A database without the GAP #7 tables yet
 * (migration 20261017024540 not applied) reads as "none" instead of breaking the inbox.
 */
export async function listUnreadNotifications(tenantId: string, limit = 5): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, conversation_id, created_at")
    .eq("tenant_id", tenantId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("notifications unavailable", error.code);
    return [];
  }
  return (data ?? []) as NotificationItem[];
}

export async function getNotificationPrefs(tenantId: string): Promise<NotificationPrefs | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_prefs").select("on_escalation, push_enabled").eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    console.error("notification prefs unavailable", error.code);
    return null;
  }
  return (data as NotificationPrefs | null) ?? null;
}
