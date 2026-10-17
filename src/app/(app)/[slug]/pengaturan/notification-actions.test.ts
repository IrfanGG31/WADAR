import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

let db = fakeSupabase();
vi.mock("@/db/shop", () => ({ getShop: async (slug: string) => ({ id: "t1", slug }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { markNotificationsRead, saveNotificationPrefs, savePushSubscription } = await import("./notification-actions");

const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BPk-key", auth: "auth-secret" } };

beforeEach(() => {
  db = fakeSupabase();
});

describe("notification settings (GAP #7)", () => {
  it("saves the escalation switch for this shop", async () => {
    expect(await saveNotificationPrefs("glow", { onEscalation: false })).toEqual({});
    const chain = db.chains.find((c) => c.table === "notification_prefs")!;
    expect(chain.calls[0]).toEqual(["update", expect.objectContaining({ on_escalation: false })]);
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
  });

  it("registers this device for push and switches push on", async () => {
    expect(await savePushSubscription("glow", SUB)).toEqual({});
    const sub = db.chains.find((c) => c.table === "push_subscriptions")!;
    expect(sub.calls[0]).toEqual([
      "upsert",
      { tenant_id: "t1", endpoint: SUB.endpoint, p256dh: "BPk-key", auth: "auth-secret" },
      { onConflict: "tenant_id,endpoint", ignoreDuplicates: true },
    ]);
    const prefs = db.chains.find((c) => c.table === "notification_prefs")!;
    expect(prefs.calls[0]).toEqual(["update", expect.objectContaining({ push_enabled: true })]);
    expect(has(prefs, "eq", "tenant_id", "t1")).toBe(true);
  });

  it("refuses an endpoint that is not a browser push service", async () => {
    expect(await savePushSubscription("glow", { ...SUB, endpoint: "https://evil.example/x" })).toEqual({ error: "Perangkat ini belum bisa menerima notifikasi." });
    expect(await savePushSubscription("glow", { endpoint: SUB.endpoint })).toEqual({ error: "Perangkat ini belum bisa menerima notifikasi." });
    expect(db.chains).toHaveLength(0);
  });

  it("marks the shop's unread notifications as read", async () => {
    await markNotificationsRead("glow");
    const chain = db.chains.find((c) => c.table === "notifications")!;
    expect(chain.calls[0][0]).toBe("update");
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "is", "read_at", null)).toBe(true);
  });
});
