import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const ROWS: Record<string, unknown[]> = {
  channels: [{ id: "ch-1", name: "Kasir (offline)" }],
  products: [{ id: "p1", name: "Kopi Susu", category: null, unit: "cup", is_active: true, deleted_at: null, created_at: "2026-10-01T00:00:00Z" }],
  variants: [],
  sales: [
    { id: "s1", occurred_at: "2026-10-02T00:00:00Z", channel_id: "ch-1", status: "completed", customer_id: null, subtotal: 18000, order_discount: 0, shipping_subsidy: 0, platform_fee: 0, total: 18000, payment_method: "tunai", note: null },
  ],
  sale_items: [],
  expenses: [],
  customers: [],
  conversations: [],
  messages: [],
};
let deletion: { deletion_requested_at: string | null; purge_after: string | null } | null = null;
let rpcError: { code: string; message: string } | null = null;
let db = fakeSupabase();
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});

vi.mock("server-only", () => ({}));
vi.mock("@/db/audit", () => ({ logAudit: async () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
// Role checks (CON-6) are covered by role-guards.test.ts; here the caller is the owner.
vi.mock("@/db/access", () => ({ permissionDenied: async () => null }));
vi.mock("@/db/shop", () => ({
  getShop: async (slug: string) => ({ id: "t1", slug, name: "Kopi Dimas", is_demo: false }),
  getShopDeletion: async () => deletion,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { cancelShopDeletion, exportShopData, purgeShop, requestShopDeletion } = await import("./data-actions");

beforeEach(() => {
  deletion = null;
  rpcError = null;
  redirect.mockClear();
  db = fakeSupabase(
    (chain) => ({ data: ROWS[chain.table] ?? [], error: null }),
    (fn) => (rpcError ? { data: null, error: rpcError } : { data: fn === "request_shop_deletion" ? "2026-10-24T01:00:00Z" : null, error: null }),
  );
});

describe("exportShopData", () => {
  it("returns a ZIP with the shop's rows, read per tenant", async () => {
    const r = await exportShopData("kopi-dimas");
    if ("error" in r) throw new Error(r.error);
    expect(r.filename).toMatch(/^wadar-kopi-dimas-\d{8}\.zip$/);
    const zip = Buffer.from(r.base64, "base64").toString("latin1");
    expect(zip.startsWith("PK\x03\x04")).toBe(true);
    expect(zip).toContain("penjualan.csv");
    expect(zip).toContain("s1,2026-10-02T00:00:00Z,Kasir (offline),completed,,18000,0,0,0,18000,tunai,");
    // every table is filtered by this shop
    const tables = db.chains.map((c) => c.table);
    expect(new Set(tables)).toEqual(new Set(Object.keys(ROWS)));
    for (const c of db.chains) expect(c.calls).toContainEqual(["eq", "tenant_id", "t1"]);
  });

  it("a failed read is reported, not a half-empty file", async () => {
    db = fakeSupabase((chain) => (chain.table === "messages" ? { data: null, error: { message: "boom" } } : { data: [], error: null }));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect(await exportShopData("kopi-dimas")).toEqual({ error: "Ekspor belum berhasil. Coba lagi sebentar." });
  });
});

describe("hapus toko bertahap", () => {
  it("stage 1 (soft-delete) needs the typed slug, then schedules via the RPC", async () => {
    expect(await requestShopDeletion("kopi-dimas", "kopi")).toEqual({ error: "Ketik nama tautan toko dengan benar untuk konfirmasi." });
    expect(db.rpcs).toHaveLength(0);

    const r = await requestShopDeletion("kopi-dimas", "kopi-dimas");
    expect(db.rpcs).toEqual([{ fn: "request_shop_deletion", args: { p_tenant_id: "t1", p_confirm_slug: "kopi-dimas" } }]);
    expect(r.error).toBeUndefined();
    expect(r.note).toMatch(/dihapus permanen/);
  });

  it("cancel clears the schedule", async () => {
    await cancelShopDeletion("kopi-dimas");
    expect(db.rpcs).toEqual([{ fn: "cancel_shop_deletion", args: { p_tenant_id: "t1" } }]);
  });

  it("stage 2 (permanent) is refused until the deletion is scheduled", async () => {
    expect(await purgeShop("kopi-dimas", "kopi-dimas")).toEqual({ error: "Jadwalkan penghapusan dulu sebelum menghapus permanen." });
    expect(db.rpcs).toHaveLength(0);
  });

  it("stage 2 deletes through purge_shop and leaves the shop", async () => {
    deletion = { deletion_requested_at: "2026-10-17T01:00:00Z", purge_after: "2026-10-24T01:00:00Z" };
    await expect(purgeShop("kopi-dimas", "kopi-dimas")).rejects.toThrow("NEXT_REDIRECT:/mulai");
    expect(db.rpcs).toEqual([{ fn: "purge_shop", args: { p_tenant_id: "t1", p_confirm_slug: "kopi-dimas" } }]);
  });

  it("RPC refusals read as plain text", async () => {
    rpcError = { code: "42501", message: "only the shop owner" };
    expect(await requestShopDeletion("kopi-dimas", "kopi-dimas")).toEqual({ error: "Hanya pemilik toko yang bisa menghapus toko." });
  });
});
