import { escalationLabel } from "./chat/inbox";

/**
 * Eskalasi ke pemilik (GAP #7; PDF Tabel 3 "di luar cakupan langsung dieskalasi ke pemilik", §C.3):
 * when a buyer's chat is handed to a human, the shop gets an in-app notification and, when
 * the owner turned it on, a web push to every subscribed device. Pure orchestration over
 * `NotifyDeps` (src/db/notifications.ts is the Supabase side, src/lib/web-push.ts the sender).
 */
export interface NotificationPrefs {
  on_escalation: boolean;
  push_enabled: boolean;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
}

/** "gone" = the push service answered 404/410: the subscription is dead and should be removed. */
export type PushResult = "sent" | "gone" | "failed";

export interface NotificationRow {
  tenant_id: string;
  kind: "chat_escalated";
  conversation_id: string;
  title: string;
  body: string;
}

export interface NotifyDeps {
  /** null = no preference row; treated as off (the migration gives every shop one, switched on). */
  loadPrefs(tenantId: string): Promise<NotificationPrefs | null>;
  insertNotification(row: NotificationRow): Promise<void>;
  listPushSubscriptions(tenantId: string): Promise<PushSubscriptionRow[]>;
  removePushSubscription(id: string): Promise<void>;
  /** Absent when VAPID keys are not configured: in-app only. */
  sendPush?: (sub: PushSubscriptionRow) => Promise<PushResult>;
}

/** Title + body for the owner. The reason only — the buyer's words never leave the inbox. */
export function escalationNotice(cause: string): { title: string; body: string } {
  return { title: "Chat perlu dibalas", body: `${escalationLabel(cause)}. Buka Chat untuk membalas.` };
}

export async function notifyEscalation(
  deps: NotifyDeps,
  args: { tenantId: string; conversationId: string; cause: string },
): Promise<{ notified: boolean; pushed: number; removed: number }> {
  const prefs = await deps.loadPrefs(args.tenantId);
  if (!prefs?.on_escalation) return { notified: false, pushed: 0, removed: 0 };

  await deps.insertNotification({ tenant_id: args.tenantId, kind: "chat_escalated", conversation_id: args.conversationId, ...escalationNotice(args.cause) });

  let pushed = 0;
  let removed = 0;
  const send = deps.sendPush;
  if (prefs.push_enabled && send) {
    const subs = await deps.listPushSubscriptions(args.tenantId);
    const results = await Promise.all(subs.map((s) => send(s).catch((): PushResult => "failed")));
    for (const [i, result] of results.entries()) {
      if (result === "sent") pushed++;
      if (result === "gone") {
        await deps.removePushSubscription(subs[i].id);
        removed++;
      }
    }
  }
  return { notified: true, pushed, removed };
}
