import { describe, expect, it } from "vitest";
import { InviteInput, invitePath, isInviteToken, RoleChangeInput, teamError } from "./team";

const TOKEN = "a".repeat(64);

describe("InviteInput", () => {
  it("normalises the email and accepts staff roles", () => {
    expect(InviteInput.parse({ email: " Rina@Toko.ID ", role: "cashier" })).toEqual({ email: "rina@toko.id", role: "cashier" });
    expect(InviteInput.safeParse({ email: "a@b.co", role: "chat_admin" }).success).toBe(true);
  });

  it("refuses a bad email and the owner role", () => {
    expect(InviteInput.safeParse({ email: "bukan-email", role: "cashier" }).error?.issues[0]?.message).toBe("Email belum benar.");
    expect(InviteInput.safeParse({ email: "a@b.co", role: "owner" }).error?.issues[0]?.message).toBe("Pilih peran: kasir atau admin chat.");
  });
});

describe("RoleChangeInput", () => {
  it("needs a member id and a known role", () => {
    expect(RoleChangeInput.safeParse({ userId: "00000000-0000-4000-8000-000000000001", role: "owner" }).success).toBe(true);
    expect(RoleChangeInput.safeParse({ userId: "x", role: "cashier" }).success).toBe(false);
    expect(RoleChangeInput.safeParse({ userId: "00000000-0000-4000-8000-000000000001", role: "manager" }).success).toBe(false);
  });
});

describe("invite links", () => {
  it("are /undangan/<64 hex>", () => {
    expect(invitePath(TOKEN)).toBe(`/undangan/${TOKEN}`);
    expect(isInviteToken(TOKEN)).toBe(true);
    expect(isInviteToken("A".repeat(64))).toBe(false);
    expect(isInviteToken("../etc")).toBe(false);
  });
});

describe("teamError", () => {
  it("maps the SQL errors to plain Indonesian", () => {
    expect(teamError({ code: "23505", message: "already a member" })).toBe("Email ini sudah jadi anggota toko.");
    expect(teamError({ code: "42501", message: "your role in this shop may not do this" })).toBe("Hanya pemilik toko yang bisa mengatur anggota tim.");
    expect(teamError({ code: "42501", message: "you cannot change your own role" })).toBe("Kamu tidak bisa mengubah peranmu sendiri.");
    expect(teamError({ code: "42501", message: "you cannot remove yourself" })).toBe("Kamu tidak bisa mencabut aksesmu sendiri.");
    expect(teamError({ code: "42501", message: "invite is for another email" })).toContain("email lain");
    expect(teamError({ code: "22023", message: "invite expired" })).toContain("kedaluwarsa");
    expect(teamError({ code: "P0002", message: "invite already used" })).toBe("Tautan undangan ini sudah dipakai.");
    expect(teamError({ code: "P0002", message: "member not found" })).toBe("Anggota ini sudah tidak ada di toko.");
    expect(teamError({ code: "XX000", message: "boom" })).toBe("Belum berhasil. Coba lagi sebentar.");
  });
});
