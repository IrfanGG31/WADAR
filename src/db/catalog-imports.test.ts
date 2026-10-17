import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
const { listCatalogImports } = await import("./catalog-imports");

let db = fakeSupabase();
beforeEach(() => {
  db = fakeSupabase();
});

const ROW = { id: "i1", file_name: "katalog.csv", rows_total: 12, created_count: 8, updated_count: 3, failed_count: 1, created_at: "2026-10-17T03:05:00Z" };

describe("listCatalogImports (GAP #3 riwayat impor)", () => {
  it("reads the shop's latest imports, newest first, limited", async () => {
    db = fakeSupabase(() => ({ data: [ROW], error: null }));
    expect(await listCatalogImports("t1", 5)).toEqual([ROW]);
    const [chain] = db.chains;
    expect(chain.table).toBe("catalog_imports");
    expect(has(chain, "select", "id, file_name, rows_total, created_count, updated_count, failed_count, created_at")).toBe(true);
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "order", "created_at", { ascending: false })).toBe(true);
    expect(has(chain, "limit", 5)).toBe(true);
  });

  it("a database without the table yet (migration not applied) reads as no history", async () => {
    db = fakeSupabase(() => ({ data: null, error: { code: "42P01", message: 'relation "catalog_imports" does not exist' } }));
    expect(await listCatalogImports("t1")).toEqual([]);
  });
});
