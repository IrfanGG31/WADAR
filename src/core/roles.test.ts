import { describe, expect, it } from "vitest";
import { can, canOpenPage, deniedMessage, deniedPageNotice, PERMISSIONS, type MemberRole } from "./roles";

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

describe("canOpenPage (menu + page guard)", () => {
  it("the owner opens every page", () => {
    for (const page of ["beranda", "kasir", "stok", "keuangan", "pelanggan", "chat", "konsultasi", "pengaturan"]) {
      expect(canOpenPage("owner", page)).toBe(true);
    }
  });

  it("a cashier gets the till and stock, not Keuangan / Chat / Konsultasi / Pengaturan", () => {
    expect(canOpenPage("cashier", "kasir")).toBe(true);
    expect(canOpenPage("cashier", "stok")).toBe(true);
    expect(canOpenPage("cashier", "beranda")).toBe(true);
    for (const page of ["keuangan", "chat", "konsultasi", "pengaturan"]) expect(canOpenPage("cashier", page)).toBe(false);
  });

  it("a chat admin gets the inbox, not the till or the money pages", () => {
    expect(canOpenPage("chat_admin", "chat")).toBe(true);
    for (const page of ["kasir", "keuangan", "konsultasi", "pengaturan"]) expect(canOpenPage("chat_admin", page)).toBe(false);
  });

  it("no membership opens nothing, not even open pages", () => {
    expect(canOpenPage(null, "beranda")).toBe(false);
    expect(canOpenPage("manager" as MemberRole, "stok")).toBe(false);
  });
});

describe("deniedPageNotice", () => {
  it("explains a refused page by name and role", () => {
    expect(deniedPageNotice("cashier", "finance")).toBe(
      "Halaman Keuangan tidak bisa dibuka dengan akun kasir. Minta pemilik toko kalau kamu butuh aksesnya.",
    );
    expect(deniedPageNotice(null, "settings")).toContain("dengan akunmu");
  });

  it("ignores missing, repeated or unknown values", () => {
    expect(deniedPageNotice("cashier", undefined)).toBeNull();
    expect(deniedPageNotice("cashier", ["finance", "settings"])).toBeNull();
    expect(deniedPageNotice("cashier", "<script>")).toBeNull();
  });
});
