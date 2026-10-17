import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
const { purgeDueShops, pruneExpiredAnswerCache } = await import("./maintenance");

describe("maintenance store (service role)", () => {
  it("purgeDueShops calls the purge_due_shops RPC and returns its count", async () => {
    const db = fakeSupabase(undefined, (fn) => ({ data: fn === "purge_due_shops" ? 3 : null, error: null }));
    expect(await purgeDueShops(db.client as never)).toBe(3);
    expect(db.rpcs).toEqual([{ fn: "purge_due_shops", args: undefined }]);
  });

  it("purgeDueShops throws the RPC error (e.g. migration not applied yet)", async () => {
    const db = fakeSupabase(undefined, () => ({ data: null, error: { message: "missing function" } }));
    await expect(purgeDueShops(db.client as never)).rejects.toMatchObject({ message: "missing function" });
  });

  it("pruneExpiredAnswerCache deletes only rows already expired at `now` and returns the count", async () => {
    const db = fakeSupabase(() => ({ data: null, error: null, count: 7 }) as never);
    const now = new Date("2026-10-18T19:00:00Z");
    expect(await pruneExpiredAnswerCache(db.client as never, now)).toBe(7);
    const [chain] = db.chains;
    expect(chain.table).toBe("ai_answer_cache");
    expect(has(chain, "delete", { count: "exact" })).toBe(true);
    expect(has(chain, "lte", "expires_at", now.toISOString())).toBe(true);
  });
});
