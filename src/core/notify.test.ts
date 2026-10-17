import { describe, expect, it } from "vitest";
import type { NotificationPrefs, NotificationRow, NotifyDeps, PushResult, PushSubscriptionRow } from "./notify";
import { escalationNotice, notifyEscalation } from "./notify";

function deps(prefs: NotificationPrefs | null, subs: PushSubscriptionRow[] = [], push?: (s: PushSubscriptionRow) => PushResult) {
  const rows: NotificationRow[] = [];
  const removed: string[] = [];
  const sent: string[] = [];
  const d: NotifyDeps = {
    loadPrefs: async () => prefs,
    insertNotification: async (row) => {
      rows.push(row);
    },
    listPushSubscriptions: async () => subs,
    removePushSubscription: async (id) => {
      removed.push(id);
    },
    sendPush: push
      ? async (s) => {
          sent.push(s.id);
          return push(s);
        }
      : undefined,
  };
  return { d, rows, removed, sent };
}
const ARGS = { tenantId: "t1", conversationId: "c1", cause: "human_requested" as const };

describe("notifyEscalation (GAP #7: eskalasi → pemilik diberi tahu)", () => {
  it("writes one in-app notification for the shop when escalation alerts are on", async () => {
    const { d, rows } = deps({ on_escalation: true, push_enabled: false });
    const r = await notifyEscalation(d, ARGS);
    expect(r).toEqual({ notified: true, pushed: 0, removed: 0 });
    expect(rows).toEqual([
      {
        tenant_id: "t1",
        kind: "chat_escalated",
        conversation_id: "c1",
        title: "Chat perlu dibalas",
        body: "Pembeli minta bicara dengan admin. Buka Chat untuk membalas.",
      },
    ]);
  });

  it("alerts switched off → nothing written, nothing pushed", async () => {
    const { d, rows, sent } = deps({ on_escalation: false, push_enabled: true }, [{ id: "s1", endpoint: "https://push.example/1" }], () => "sent");
    expect(await notifyEscalation(d, ARGS)).toEqual({ notified: false, pushed: 0, removed: 0 });
    expect(rows).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("no preference row at all → not sent (every shop gets one, on, from the migration)", async () => {
    const { d, rows } = deps(null);
    expect((await notifyEscalation(d, ARGS)).notified).toBe(false);
    expect(rows).toEqual([]);
  });

  it("push goes to every subscribed device when push is on and VAPID is configured", async () => {
    const subs = [
      { id: "s1", endpoint: "https://push.example/1" },
      { id: "s2", endpoint: "https://push.example/2" },
    ];
    const { d, sent } = deps({ on_escalation: true, push_enabled: true }, subs, () => "sent");
    expect(await notifyEscalation(d, ARGS)).toEqual({ notified: true, pushed: 2, removed: 0 });
    expect(sent).toEqual(["s1", "s2"]);
  });

  it("expired subscriptions (404/410) are removed; one failing device doesn't stop the others", async () => {
    const subs = [
      { id: "gone", endpoint: "https://push.example/g" },
      { id: "flaky", endpoint: "https://push.example/f" },
      { id: "ok", endpoint: "https://push.example/o" },
    ];
    const { d, removed } = deps({ on_escalation: true, push_enabled: true }, subs, (s) => (s.id === "gone" ? "gone" : s.id === "flaky" ? "failed" : "sent"));
    expect(await notifyEscalation(d, ARGS)).toEqual({ notified: true, pushed: 1, removed: 1 });
    expect(removed).toEqual(["gone"]);
  });

  it("push off, or no VAPID keys → in-app only", async () => {
    const subs = [{ id: "s1", endpoint: "https://push.example/1" }];
    const off = deps({ on_escalation: true, push_enabled: false }, subs, () => "sent");
    expect(await notifyEscalation(off.d, ARGS)).toEqual({ notified: true, pushed: 0, removed: 0 });
    expect(off.sent).toEqual([]);
    const noKeys = deps({ on_escalation: true, push_enabled: true }, subs);
    expect(await notifyEscalation(noKeys.d, ARGS)).toEqual({ notified: true, pushed: 0, removed: 0 });
  });

  it("the notice names the reason in plain words and never quotes the buyer", () => {
    expect(escalationNotice("low_confidence")).toEqual({ title: "Chat perlu dibalas", body: "AI kurang yakin. Buka Chat untuk membalas." });
    expect(escalationNotice("something_new")).toEqual({ title: "Chat perlu dibalas", body: "Perlu dicek admin. Buka Chat untuk membalas." });
  });
});
