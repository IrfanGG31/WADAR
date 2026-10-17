import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

let row: { role: string } | null = { role: "cashier" };
let sub: string | null = "u1";
let db = fakeSupabase();
const client = () => ({ ...db.client, auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null, error: null }) } });

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock("@/db/shop", () => ({ getShop: async (slug: string) => ({ id: "t1", slug }) }));
const { getMyRole, permissionDenied, requirePermission } = await import("./access");

beforeEach(() => {
  row = { role: "cashier" };
  sub = "u1";
  db = fakeSupabase(() => ({ data: row, error: null }));
});

describe("access (signed-in user's role in a shop)", () => {
  it("reads the caller's own membership row for that shop", async () => {
    expect(await getMyRole("t1")).toBe("cashier");
    const [chain] = db.chains;
    expect(chain.table).toBe("memberships");
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "eq", "user_id", "u1")).toBe(true);
  });

  it("no session or no membership = no role (never assumed owner)", async () => {
    row = null;
    expect(await getMyRole("t2")).toBeNull();
    sub = null;
    expect(await getMyRole("t3")).toBeNull();
  });

  it("permissionDenied: null when allowed, the clear message when not", async () => {
    expect(await permissionDenied("t4", "sell")).toBeNull();
    expect(await permissionDenied("t5", "settings")).toBe("Akun kasir tidak bisa mengubah pengaturan toko. Minta pemilik toko melakukannya.");
  });
});

describe("requirePermission (page guard)", () => {
  it("returns the shop and role when allowed", async () => {
    row = { role: "cashier" };
    expect(await requirePermission("toko", "sell")).toEqual({ shop: { id: "t1", slug: "toko" }, role: "cashier" });
  });

  it("sends a member without the permission to Beranda with the reason", async () => {
    row = { role: "cashier" };
    await expect(requirePermission("toko", "finance")).rejects.toThrow("NEXT_REDIRECT:/toko/beranda?ditolak=finance");
    row = { role: "chat_admin" };
    await expect(requirePermission("toko", "settings")).rejects.toThrow("NEXT_REDIRECT:/toko/beranda?ditolak=settings");
  });

  it("no role is refused too (never treated as owner)", async () => {
    sub = null;
    await expect(requirePermission("toko", "consult")).rejects.toThrow("NEXT_REDIRECT:/toko/beranda?ditolak=consult");
  });
});
