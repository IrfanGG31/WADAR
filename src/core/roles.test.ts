import { describe, expect, it } from "vitest";
import { can, deniedMessage, PERMISSIONS, type MemberRole } from "./roles";

describe("can (CON-6 / TEAM-1 role matrix)", () => {
  it("the owner may do everything", () => {
    for (const p of PERMISSIONS) expect(can("owner", p)).toBe(true);
  });

  it("a cashier may sell and book stock in, nothing administrative", () => {
    const allowed = PERMISSIONS.filter((p) => can("cashier", p));
    expect(allowed).toEqual(["sell", "stock_in"]);
  });

  it("a chat admin may only handle chats", () => {
    expect(PERMISSIONS.filter((p) => can("chat_admin", p))).toEqual(["chat"]);
  });

  it("no membership (or an unknown role) may do nothing", () => {
    for (const p of PERMISSIONS) {
      expect(can(null, p)).toBe(false);
      expect(can("manager" as MemberRole, p)).toBe(false);
    }
  });
});

describe("deniedMessage", () => {
  it("names the role, the blocked action and who to ask", () => {
    expect(deniedMessage("cashier", "settings")).toBe("Akun kasir tidak bisa mengubah pengaturan toko. Minta pemilik toko melakukannya.");
    expect(deniedMessage("chat_admin", "sell")).toBe("Akun admin chat tidak bisa mencatat penjualan. Minta pemilik toko melakukannya.");
    expect(deniedMessage(null, "chat")).toBe("Kamu bukan anggota toko ini, jadi tidak bisa membalas chat pembeli.");
  });

  it("every permission has its own wording", () => {
    const texts = PERMISSIONS.map((p) => deniedMessage("cashier", p));
    expect(new Set(texts).size).toBe(PERMISSIONS.length);
  });
});
