import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, has, type Chain } from "@/test/fake-supabase";

const db = fakeSupabase((chain: Chain) => {
  if (chain.table === "tenants") return { data: { id: "tenant-a" }, error: null };
  if (chain.table === "conversations") return { data: { id: "conv-1" }, error: null };
  return { data: [], error: null };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

const { GET } = await import("./route");

describe("widget stream", () => {
  it("reads messages of the conversation within the shop only", async () => {
    const abort = new AbortController();
    const res = await GET(
      new Request("http://x/api/widget/toko-a/stream", { headers: { cookie: `wadar_wid=${"A".repeat(24)}` }, signal: abort.signal }),
      { params: Promise.resolve({ slug: "toko-a" }) },
    );
    const reader = res.body!.getReader();
    await reader.read(); // retry line
    await reader.read(); // first poll
    abort.abort();
    await reader.cancel();
    const messages = db.chains.find((c) => c.table === "messages")!;
    expect(has(messages, "eq", "conversation_id", "conv-1")).toBe(true);
    expect(has(messages, "eq", "tenant_id", "tenant-a")).toBe(true);
  });
});
