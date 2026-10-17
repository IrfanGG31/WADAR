import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const { findOpenShop } = await import("./open-shop");

describe("findOpenShop (GAP #6: a shop scheduled for deletion is closed for buyers)", () => {
  it("returns an active shop", async () => {
    const db = fakeSupabase(() => ({ data: { id: "t1", name: "Glow", deletion_requested_at: null }, error: null }));
    expect(await findOpenShop(db.client as never, "glow")).toEqual({ id: "t1", name: "Glow" });
  });

  it("hides a shop whose deletion is scheduled", async () => {
    const db = fakeSupabase(() => ({ data: { id: "t1", name: "Glow", deletion_requested_at: "2026-10-17T00:00:00Z" }, error: null }));
    expect(await findOpenShop(db.client as never, "glow")).toBeNull();
  });

  it("unknown slug → null", async () => {
    const db = fakeSupabase(() => ({ data: null, error: null }));
    expect(await findOpenShop(db.client as never, "nope")).toBeNull();
  });

  it("before the deletion migration is applied (column missing) the shop stays open", async () => {
    const db = fakeSupabase((chain) =>
      chain.calls.some(([m, cols]) => m === "select" && String(cols).includes("deletion_requested_at"))
        ? { data: null, error: { code: "42703", message: "column does not exist" } }
        : { data: { id: "t1", name: "Glow" }, error: null },
    );
    expect(await findOpenShop(db.client as never, "glow")).toEqual({ id: "t1", name: "Glow" });
  });
});
