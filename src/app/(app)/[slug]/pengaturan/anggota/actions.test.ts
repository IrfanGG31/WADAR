import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/core/roles";
import { fakeSupabase } from "@/test/fake-supabase";

/** TEAM-1: only the owner manages the team; a refused call never reaches the database. */
let role: MemberRole | null = "owner";
let rpcError: { code: string; message: string } | null = null;
let db = fakeSupabase();
const TOKEN = "b".repeat(64);
const MEMBER = "00000000-0000-4000-8000-000000000009";

vi.mock("server-only", () => ({}));
vi.mock("@/db/shop", () => ({ getShop: async (slug: string) => ({ id: "t1", slug, name: "Kopi Dimas" }) }));
vi.mock("@/db/access", async () => {
  const { can, deniedMessage } = await import("@/core/roles");
  return { permissionDenied: async (_t: string, p: Parameters<typeof can>[1]) => (can(role, p) ? null : deniedMessage(role, p)) };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...db.client,
    rpc: (fn: string, args?: unknown) => {
      const call = db.client.rpc(fn, args);
      return Object.assign(call, { single: () => call });
    },
  }),
}));

const { changeMemberRole, inviteMember, removeMember, revokeInvite } = await import("./actions");

beforeEach(() => {
  role = "owner";
  rpcError = null;
  db = fakeSupabase(undefined, (fn) =>
    rpcError ? { data: null, error: rpcError } : { data: fn === "create_shop_invite" ? { token: TOKEN, email: "rina@toko.id" } : null, error: null },
  );
});

describe("owner", () => {
  it("creates an invite link for a normalised email (no email sent)", async () => {
    expect(await inviteMember("kopi", { email: " Rina@Toko.ID ", role: "cashier" })).toEqual({ path: `/undangan/${TOKEN}`, email: "rina@toko.id" });
    expect(db.rpcs).toEqual([{ fn: "create_shop_invite", args: { p_tenant_id: "t1", p_email: "rina@toko.id", p_role: "cashier" } }]);
  });

  it("changes a role, removes a member and revokes an invite", async () => {
    expect(await changeMemberRole("kopi", { userId: MEMBER, role: "chat_admin" })).toEqual({ note: "Peran diperbarui." });
    expect((await removeMember("kopi", MEMBER)).error).toBeUndefined();
    expect((await revokeInvite("kopi", "inv-1")).error).toBeUndefined();
    expect(db.rpcs.map((r) => r.fn)).toEqual(["set_member_role", "remove_shop_member", "revoke_shop_invite"]);
    expect(db.rpcs[0].args).toEqual({ p_tenant_id: "t1", p_user_id: MEMBER, p_role: "chat_admin" });
  });

  it("validates input before any call", async () => {
    expect(await inviteMember("kopi", { email: "bukan-email", role: "cashier" })).toEqual({ error: "Email belum benar." });
    expect(await inviteMember("kopi", { email: "a@b.co", role: "owner" })).toEqual({ error: "Pilih peran: kasir atau admin chat." });
    expect((await changeMemberRole("kopi", { userId: "x", role: "cashier" })).error).toBe("Anggota tidak ditemukan.");
    expect(db.rpcs).toHaveLength(0);
  });

  it("shows the SQL refusal in plain words", async () => {
    rpcError = { code: "23505", message: "already a member" };
    expect(await inviteMember("kopi", { email: "a@b.co", role: "cashier" })).toEqual({ error: "Email ini sudah jadi anggota toko." });
    rpcError = { code: "42501", message: "you cannot change your own role" };
    expect(await changeMemberRole("kopi", { userId: MEMBER, role: "cashier" })).toEqual({ error: "Kamu tidak bisa mengubah peranmu sendiri." });
  });
});

describe.each<MemberRole | null>(["cashier", "chat_admin", null])("%s", (r) => {
  it("is refused on every team action and touches nothing", async () => {
    role = r;
    const results = [
      await inviteMember("kopi", { email: "a@b.co", role: "cashier" }),
      await changeMemberRole("kopi", { userId: MEMBER, role: "owner" }),
      await removeMember("kopi", MEMBER),
      await revokeInvite("kopi", "inv-1"),
    ];
    for (const result of results) expect("error" in result && result.error).toMatch(/mengatur anggota tim/);
    expect(db.rpcs).toHaveLength(0);
  });
});
