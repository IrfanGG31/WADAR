import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
const { listShopsForRollup, rollupShopDays } = await import("./rollup");

describe("rollup store (service role)", () => {
  it("listShopsForRollup reads every shop's id + timezone in a stable order", async () => {
    const db = fakeSupabase(() => ({ data: [{ id: "t1", timezone: "Asia/Jakarta" }], error: null }));
    expect(await listShopsForRollup(db.client as never)).toEqual([{ id: "t1", timezone: "Asia/Jakarta" }]);
    const [chain] = db.chains;
    expect(chain.table).toBe("tenants");
    expect(has(chain, "select", "id, timezone")).toBe(true);
    expect(has(chain, "order", "id")).toBe(true);
  });

  it("rollupShopDays calls rollup_daily for one shop and window and returns the row counts", async () => {
    const db = fakeSupabase(undefined, () => ({ data: [{ fin_rows: 5, stock_rows: 8 }], error: null }));
    const r = await rollupShopDays(db.client as never, "t1", { from: "2026-10-16", to: "2026-10-17" });
    expect(r).toEqual({ fin_rows: 5, stock_rows: 8 });
    expect(db.rpcs).toEqual([{ fn: "rollup_daily", args: { p_tenant_id: "t1", p_from: "2026-10-16", p_to: "2026-10-17" } }]);
  });

  it("rollupShopDays throws the RPC error (e.g. migration not applied yet)", async () => {
    const db = fakeSupabase(undefined, () => ({ data: null, error: { message: "missing function" } }));
    await expect(rollupShopDays(db.client as never, "t1", { from: "2026-10-17", to: "2026-10-17" })).rejects.toMatchObject({
      message: "missing function",
    });
  });
});
