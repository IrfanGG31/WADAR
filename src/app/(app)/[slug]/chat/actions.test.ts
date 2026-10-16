import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has, type Chain } from "@/test/fake-supabase";

const SHOP = { id: "tenant-a" };
let db: ReturnType<typeof fakeSupabase>;
vi.mock("@/db/shop", () => ({ getShop: async () => SHOP }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { sendReply } = await import("./actions");

/** The conversation update matches a row only when it belongs to this shop. */
const respondWith = (ownConversation: boolean) => (chain: Chain) =>
  chain.table === "conversations" ? { data: ownConversation ? { id: "conv-1" } : null, error: null } : { data: null, error: null };

describe("sendReply (cross-tenant)", () => {
  beforeEach(() => {
    db = fakeSupabase(respondWith(false));
  });

  it("refuses a conversation of another shop and inserts no message", async () => {
    const r = await sendReply("toko-a", "conv-of-tenant-b", { text: "halo" });
    expect(r.error).toBeTruthy();
    expect(db.chains.some((c) => c.table === "messages")).toBe(false);
    const conv = db.chains.find((c) => c.table === "conversations")!;
    expect(has(conv, "eq", "tenant_id", "tenant-a")).toBe(true);
  });

  it("replies in an own conversation", async () => {
    db = fakeSupabase(respondWith(true));
    expect(await sendReply("toko-a", "conv-1", { text: "halo" })).toEqual({});
    const msg = db.chains.find((c) => c.table === "messages")!;
    expect(has(msg, "insert")).toBe(true);
    expect(msg.calls.find(([m]) => m === "insert")?.[1]).toMatchObject({ tenant_id: "tenant-a", conversation_id: "conv-1" });
  });
});
