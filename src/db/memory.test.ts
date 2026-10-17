import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
const { deleteMemory, listMemory, updateMemory } = await import("./memory");

let db = fakeSupabase();
beforeEach(() => {
  db = fakeSupabase();
});

describe("memory_items store (CON-4)", () => {
  it("lists the shop's memory, pinned first then newest", async () => {
    const rows = [{ id: "m1", kind: "preference", content: "Jangan diskon di atas 15%", pinned: true }];
    db = fakeSupabase(() => ({ data: rows, error: null }));
    expect(await listMemory("t1")).toEqual(rows);
    const [chain] = db.chains;
    expect(chain.table).toBe("memory_items");
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "order", "pinned", { ascending: false })).toBe(true);
  });

  it("updates only the content of one item of this shop and reports whether it existed", async () => {
    db = fakeSupabase(() => ({ data: [{ id: "m1" }], error: null }));
    expect(await updateMemory("t1", "m1", "Diskon maks 10%")).toBe(true);
    const [chain] = db.chains;
    expect(has(chain, "update", { content: "Diskon maks 10%" })).toBe(true);
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "eq", "id", "m1")).toBe(true);

    db = fakeSupabase(() => ({ data: [], error: null }));
    expect(await updateMemory("t1", "lain", "Diskon maks 10%")).toBe(false);
  });

  it("deletes one item of this shop and throws database errors", async () => {
    db = fakeSupabase(() => ({ data: [{ id: "m1" }], error: null }));
    expect(await deleteMemory("t1", "m1")).toBe(true);
    const [chain] = db.chains;
    expect(has(chain, "delete")).toBe(true);
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "eq", "id", "m1")).toBe(true);

    db = fakeSupabase(() => ({ data: null, error: { code: "42501", message: "permission denied for table memory_items" } }));
    await expect(deleteMemory("t1", "m1")).rejects.toMatchObject({ code: "42501" });
  });
});
