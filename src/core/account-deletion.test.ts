import { describe, expect, it } from "vitest";
import {
  ACCOUNT_CONFIRM_WORD,
  accountConfirmTarget,
  accountDeletionError,
  blockedMessage,
  confirmsAccountDeletion,
  parseAccountDeletion,
} from "./account-deletion";

describe("hapus akun (GAP #6)", () => {
  it("the user types their email; an account without one (anonymous demo) types HAPUS", () => {
    expect(accountConfirmTarget(" Sari@Mail.com ")).toBe("sari@mail.com");
    expect(accountConfirmTarget(null)).toBe(ACCOUNT_CONFIRM_WORD);
    expect(accountConfirmTarget("")).toBe("HAPUS");
  });

  it("confirmation ignores case and surrounding spaces, never matches empty", () => {
    expect(confirmsAccountDeletion("sari@mail.com", "  SARI@mail.com ")).toBe(true);
    expect(confirmsAccountDeletion("sari@mail.com", "sari")).toBe(false);
    expect(confirmsAccountDeletion("sari@mail.com", "")).toBe(false);
    expect(confirmsAccountDeletion(null, "hapus")).toBe(true);
    expect(confirmsAccountDeletion(null, "")).toBe(false);
    expect(confirmsAccountDeletion(undefined, undefined)).toBe(false);
  });

  it("parses the RPC result defensively", () => {
    expect(parseAccountDeletion({ deleted: true, blocked_shops: [], left_shops: 2, deleted_demo_shops: 1 })).toEqual({
      deleted: true,
      blockedShops: [],
      leftShops: 2,
      deletedDemoShops: 1,
    });
    expect(parseAccountDeletion({ deleted: false, blocked_shops: [{ slug: "kopi-dimas", name: "Kopi Dimas" }, { name: "x" }, null] })).toEqual({
      deleted: false,
      blockedShops: [{ slug: "kopi-dimas", name: "Kopi Dimas" }],
      leftShops: 0,
      deletedDemoShops: 0,
    });
    expect(parseAccountDeletion(null).deleted).toBe(false);
  });

  it("refusal names every shop where the user is the last owner and says what to do", () => {
    expect(blockedMessage([{ slug: "a", name: "Kopi Dimas" }])).toBe(
      "Akun belum dihapus: kamu pemilik terakhir toko Kopi Dimas. Hapus toko itu dulu (Pengaturan → Data & privasi) atau jadikan anggota lain pemilik (Pengaturan → Anggota tim), lalu coba lagi.",
    );
    expect(blockedMessage([{ slug: "a", name: "A" }, { slug: "b", name: "B" }, { slug: "c", name: "C" }])).toMatch(/toko A, B dan C\./);
  });

  it("RPC errors read as plain Indonesian; a missing function (migration not applied) says so", () => {
    expect(accountDeletionError(null)).toBeUndefined();
    expect(accountDeletionError({ code: "22023" })).toBe("Konfirmasi tidak cocok. Ketik persis seperti yang diminta.");
    expect(accountDeletionError({ code: "28000" })).toMatch(/Masuk lagi/);
    expect(accountDeletionError({ code: "PGRST202" })).toMatch(/belum aktif/);
    expect(accountDeletionError({ code: "XX000", message: "boom" })).toBe("Akun belum terhapus. Datamu tidak berubah, coba lagi sebentar.");
  });
});
