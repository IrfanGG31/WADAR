import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/core/roles";
import { fakeSupabase } from "@/test/fake-supabase";

/** CON-6: every write action asks the caller's role first; a denied call touches nothing. */
let role: MemberRole | null = "owner";
let db = fakeSupabase();
const updateMemory = vi.fn(async () => true);

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/db/shop", () => ({
  getShop: async (slug: string) => ({ id: "t1", slug, name: "Kopi Dimas", is_demo: true, timezone: "Asia/Jakarta" }),
  getShopDeletion: async () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...db.client,
    // supabase-js lets `.single()` follow `.rpc()` (stock_in).
    rpc: (fn: string, args?: unknown) => {
      const call = db.client.rpc(fn, args);
      return Object.assign(call, { single: () => call });
    },
  }),
}));
vi.mock("@/db/memory", () => ({ updateMemory: () => updateMemory(), deleteMemory: async () => true }));
vi.mock("@/db/access", async () => {
  const { can, deniedMessage } = await import("@/core/roles");
  return { permissionDenied: async (_t: string, p: Parameters<typeof can>[1]) => (can(role, p) ? null : deniedMessage(role, p)) };
});

const { deleteFaq, resetDemoShop } = await import("./pengaturan/actions");
const { exportShopData, requestShopDeletion } = await import("./pengaturan/data-actions");
const { sendReply, takeOver } = await import("./chat/actions");
const { recordSale, voidSale } = await import("./kasir/actions");
const { adjustStock, archiveProduct, countStock, stockIn } = await import("./stok/actions");
const { addExpense, voidExpense } = await import("./keuangan/pengeluaran/actions");
const { updateChannel } = await import("./pengaturan/kanal/actions");
const { updateCustomerProfile } = await import("./pelanggan/actions");
const { hideSetupChecklist } = await import("./beranda/setup-actions");
const { updateMemoryItem } = await import("./konsultasi/memory-actions");

const SALE = {
  channel_id: "00000000-0000-4000-8000-000000000001",
  items: [{ variant_id: "00000000-0000-4000-8000-000000000002", qty: 1 }],
  payment_method: "tunai",
  idempotency_key: "cart-12345678",
};
const VOID = { sale_id: "00000000-0000-4000-8000-000000000003", reason: "salah input" };
const VARIANT = "00000000-0000-4000-8000-000000000002";
const ADJUST = { variant_id: VARIANT, reason: "rusak", qty: 2, note: "pecah" };
const OPNAME = { variant_id: VARIANT, counted: 7 };
const EXPENSE = { amount: 50000, category: "Sewa", occurred_on: "2026-10-18", note: "", idempotency_key: "exp-12345678" };
const STOCK_IN = { variant_id: "00000000-0000-4000-8000-000000000002", qty: 5, unit_cost: 10000 };

beforeEach(() => {
  role = "owner";
  updateMemory.mockClear();
  db = fakeSupabase(
    (chain) => ({ data: chain.calls.some(([m]) => m === "maybeSingle") ? { id: "c1" } : [], error: null }),
    (fn) => ({
      data:
        fn === "record_sale"
          ? { sale_id: "s1", total: 10000 }
          : fn === "stock_in"
            ? { on_hand: 5, avg_cost: 10000 }
            : fn === "adjust_stock"
              ? { on_hand: 3 }
              : fn === "stock_opname"
                ? { before: 5, counted: 7, diff: 2 }
                : null,
      error: null,
    }),
  );
});

const touched = () => db.chains.length + db.rpcs.length;

describe("kasir (cashier)", () => {
  beforeEach(() => {
    role = "cashier";
  });

  it("cannot do owner actions: settings, shop data, catalog, chat, konsultasi — with a clear message, nothing written", async () => {
    expect(await deleteFaq("kopi-dimas", "doc-1")).toEqual({ error: "Akun kasir tidak bisa mengubah pengaturan toko. Minta pemilik toko melakukannya." });
    expect(await resetDemoShop("kopi-dimas")).toEqual({ error: "Akun kasir tidak bisa mengubah pengaturan toko. Minta pemilik toko melakukannya." });
    expect(await exportShopData("kopi-dimas")).toEqual({ error: "Akun kasir tidak bisa mengekspor atau menghapus data toko. Minta pemilik toko melakukannya." });
    expect((await requestShopDeletion("kopi-dimas", "kopi-dimas")).error).toMatch(/^Akun kasir tidak bisa/);
    expect(await archiveProduct("kopi-dimas", "p1")).toEqual({ error: "Akun kasir tidak bisa mengubah daftar produk. Minta pemilik toko melakukannya." });
    expect(await takeOver("kopi-dimas", "c1")).toEqual({ error: "Akun kasir tidak bisa membalas chat pembeli. Minta pemilik toko melakukannya." });
    expect(await updateMemoryItem("kopi-dimas", "m1", "Toko buka jam 8")).toEqual({
      error: "Akun kasir tidak bisa memakai Konsultasi Bisnis. Minta pemilik toko melakukannya.",
    });
    expect(await voidSale("kopi-dimas", VOID)).toEqual({ error: "Akun kasir tidak bisa membatalkan transaksi. Minta pemilik toko melakukannya." });
    expect(touched()).toBe(0);
    expect(updateMemory).not.toHaveBeenCalled();
  });

  it("cannot adjust or count stock, record expenses, or change commissions (owner only)", async () => {
    expect((await adjustStock("kopi-dimas", ADJUST)).error).toMatch(/^Akun kasir tidak bisa/);
    expect((await countStock("kopi-dimas", OPNAME)).error).toMatch(/^Akun kasir tidak bisa/);
    expect((await addExpense("kopi-dimas", EXPENSE)).error).toMatch(/^Akun kasir tidak bisa/);
    expect((await voidExpense("kopi-dimas", "00000000-0000-4000-8000-000000000009", "salah")).error).toMatch(/^Akun kasir tidak bisa/);
    expect((await updateChannel("kopi-dimas", "00000000-0000-4000-8000-000000000001", { fee_pct: 5, fee_fixed: 0, is_active: true })).error).toMatch(
      /^Akun kasir tidak bisa/,
    );
    expect((await hideSetupChecklist("kopi-dimas")).error).toMatch(/^Akun kasir tidak bisa/);
    expect(touched()).toBe(0);
  });

  it("can still sell and book stock in", async () => {
    expect((await recordSale("kopi-dimas", SALE)).error).toBeUndefined();
    expect((await stockIn("kopi-dimas", STOCK_IN)).error).toBeUndefined();
    expect(db.rpcs.map((r) => r.fn)).toEqual(["record_sale", "stock_in"]);
  });
});

describe("admin chat", () => {
  it("handles chats but cannot sell", async () => {
    role = "chat_admin";
    expect(await sendReply("kopi-dimas", "c1", { text: "Halo kak" })).toEqual({});
    const before = touched();
    expect(await recordSale("kopi-dimas", SALE)).toEqual({ error: "Akun admin chat tidak bisa mencatat penjualan. Minta pemilik toko melakukannya." });
    expect(touched()).toBe(before);
    expect((await updateCustomerProfile("kopi-dimas", "c1", { name: "Tari", notes: "", tags: [] })).error).toMatch(/^Akun admin chat tidak bisa/);
    expect(touched()).toBe(before);
  });
});

describe("pemilik (owner)", () => {
  it("can do the admin actions", async () => {
    expect((await deleteFaq("kopi-dimas", "doc-1")).error).toBeUndefined();
    expect(await takeOver("kopi-dimas", "c1")).toEqual({});
    expect(await updateMemoryItem("kopi-dimas", "m1", "Toko buka jam 8")).toEqual({});
    expect("filename" in (await exportShopData("kopi-dimas"))).toBe(true);
    expect((await voidSale("kopi-dimas", VOID)).error).toBeUndefined();
    expect(db.rpcs.at(-1)).toMatchObject({ fn: "void_sale", args: { p_sale_id: VOID.sale_id, p_reason: "salah input" } });
    await expect(archiveProduct("kopi-dimas", "p1")).rejects.toThrow("NEXT_REDIRECT:/kopi-dimas/stok");
  });

  it("adjusts stock with the reason's sign and counts stock (STK-0b)", async () => {
    expect(await adjustStock("kopi-dimas", ADJUST)).toEqual({ onHand: 3 });
    expect(db.rpcs.at(-1)).toEqual({ fn: "adjust_stock", args: { p_variant_id: VARIANT, p_qty: -2, p_reason: "rusak", p_note: "pecah" } });
    expect(await countStock("kopi-dimas", OPNAME)).toEqual({ onHand: 7, diff: 2 });
    expect(db.rpcs.at(-1)).toEqual({ fn: "stock_opname", args: { p_variant_id: VARIANT, p_counted: 7, p_note: null } });
    expect((await adjustStock("kopi-dimas", { ...ADJUST, qty: 0 })).error).toBe("Jumlah tidak boleh 0.");
  });
});

describe("bukan anggota", () => {
  it("gets refused, never treated as owner", async () => {
    role = null;
    expect((await deleteFaq("kopi-dimas", "doc-1")).error).toBe("Kamu bukan anggota toko ini, jadi tidak bisa mengubah pengaturan toko.");
    expect(touched()).toBe(0);
  });
});
