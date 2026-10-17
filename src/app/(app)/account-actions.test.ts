import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

let claims: Record<string, unknown> | null = { sub: "u1", email: "sari@mail.com" };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let db = fakeSupabase();
const signOut = vi.fn(async () => ({ error: null }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...db.client,
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }), signOut },
  }),
}));

const { deleteMyAccount } = await import("./account-actions");

beforeEach(() => {
  claims = { sub: "u1", email: "sari@mail.com" };
  rpcResult = { data: { deleted: true, blocked_shops: [], left_shops: 1, deleted_demo_shops: 0 }, error: null };
  signOut.mockClear();
  db = fakeSupabase(undefined, () => rpcResult);
});

describe("deleteMyAccount (GAP #6)", () => {
  it("wrong confirmation or no session touches nothing", async () => {
    expect(await deleteMyAccount("sari")).toEqual({ error: "Konfirmasi tidak cocok. Ketik persis seperti yang diminta." });
    claims = null;
    expect((await deleteMyAccount("sari@mail.com")).error).toMatch(/Masuk lagi/);
    expect(db.rpcs).toHaveLength(0);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("deletes, signs out and leaves the app", async () => {
    await expect(deleteMyAccount(" SARI@mail.com ")).rejects.toThrow("NEXT_REDIRECT:/");
    expect(db.rpcs).toEqual([{ fn: "delete_my_account", args: { p_confirm: "SARI@mail.com" } }]);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("the last owner of a shop is refused with the shops listed and stays signed in", async () => {
    rpcResult = { data: { deleted: false, blocked_shops: [{ slug: "kopi-dimas", name: "Kopi Dimas" }] }, error: null };
    const r = await deleteMyAccount("sari@mail.com");
    expect(r.blockedShops).toEqual([{ slug: "kopi-dimas", name: "Kopi Dimas" }]);
    expect(r.error).toMatch(/^Akun belum dihapus: kamu pemilik terakhir toko Kopi Dimas\./);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("an anonymous demo account confirms with HAPUS", async () => {
    claims = { sub: "anon-1", is_anonymous: true };
    await expect(deleteMyAccount("hapus")).rejects.toThrow("NEXT_REDIRECT:/");
    expect(db.rpcs[0]?.args).toEqual({ p_confirm: "hapus" });
  });

  it("migration not applied yet → clear message, still signed in", async () => {
    rpcResult = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    expect((await deleteMyAccount("sari@mail.com")).error).toMatch(/belum aktif di server/);
    expect(signOut).not.toHaveBeenCalled();
  });
});
