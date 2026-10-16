import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has, type Chain } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
let db: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { listCatalog } = await import("./catalog");
const { consultUsageThisMonth, memoryQuery } = await import("./consult");

const rangeOf = (chain: Chain) => chain.calls.find(([m]) => m === "range") as [string, number, number] | undefined;

describe("review P6 — data loaders", () => {
  beforeEach(() => {
    db = fakeSupabase();
  });

  it("listCatalog pages past PostgREST's 1000-row cap", async () => {
    db = fakeSupabase((chain) => {
      const r = rangeOf(chain);
      const n = !r ? 1000 : r[1] === 0 ? 1000 : 3; // no range = the cap silently cuts at 1000
      return { data: Array.from({ length: n }, (_, i) => ({ id: `p${(r?.[1] ?? 0) + i}`, variants: [] })), error: null };
    });
    expect(await listCatalog("t1")).toHaveLength(1003);
  });

  it("memory: newest and pinned first, so the limit drops the oldest", () => {
    memoryQuery(db.client as never, "t1");
    const chain = db.chains[0];
    const orders = chain.calls.filter(([m]) => m === "order");
    expect(orders).toEqual([
      ["order", "pinned", { ascending: false }],
      ["order", "created_at", { ascending: false }],
    ]);
    expect(has(chain, "limit", 50)).toBe(true);
  });

  it("consult usage counts from the shop's local month start (WIB), not UTC", async () => {
    db = fakeSupabase(() => ({ data: null, error: null, count: 0 }) as never);
    await consultUsageThisMonth("t1", "2026-10-17", "Asia/Jakarta");
    expect(has(db.chains[0], "gte", "created_at", "2026-09-30T17:00:00.000Z")).toBe(true);
  });
});
