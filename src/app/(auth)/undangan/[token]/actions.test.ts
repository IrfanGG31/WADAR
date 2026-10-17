import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

let rpcResult: { data: unknown; error: unknown } = { data: "kopi-dimas", error: null };
let db = fakeSupabase();
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
const { acceptInvite } = await import("./actions");
const TOKEN = "c".repeat(64);

beforeEach(() => {
  rpcResult = { data: "kopi-dimas", error: null };
  db = fakeSupabase(undefined, () => rpcResult);
});

describe("acceptInvite", () => {
  it("joins the shop and lands on its Beranda", async () => {
    await expect(acceptInvite(TOKEN)).rejects.toThrow("NEXT_REDIRECT:/kopi-dimas/beranda");
    expect(db.rpcs).toEqual([{ fn: "accept_shop_invite", args: { p_token: TOKEN } }]);
  });

  it("refuses a malformed token without a call", async () => {
    expect(await acceptInvite("../x")).toEqual({ error: "Undangan tidak ditemukan atau sudah dibatalkan." });
    expect(db.rpcs).toHaveLength(0);
  });

  it("explains a wrong email or an expired link", async () => {
    rpcResult = { data: null, error: { code: "42501", message: "invite is for another email" } };
    expect(await acceptInvite(TOKEN)).toEqual({ error: "Undangan ini untuk email lain. Masuk dengan email yang diundang." });
    rpcResult = { data: null, error: { code: "22023", message: "invite expired" } };
    expect((await acceptInvite(TOKEN)).error).toContain("kedaluwarsa");
  });
});
