import { describe, expect, it } from "vitest";
import { countedTotal, isVoidable, saleStatusLabel, VoidSaleInput, voidResultNote, voidSaleError } from "./sale-void";

describe("void penjualan (POS-5)", () => {
  it("only a completed sale can be voided; a void is final", () => {
    expect(isVoidable("completed")).toBe(true);
    for (const s of ["void", "canceled", "returned", null, undefined, ""]) expect(isVoidable(s)).toBe(false);
  });

  it("Riwayat labels non-completed sales and shows nothing for a normal sale", () => {
    expect(saleStatusLabel("void")).toBe("Dibatalkan");
    expect(saleStatusLabel("returned")).toBe("Diretur");
    expect(saleStatusLabel("canceled")).toBe("Batal");
    expect(saleStatusLabel("completed")).toBeNull();
  });

  it("the day total counts completed sales only (string bigints from PostgREST included)", () => {
    expect(countedTotal([{ status: "completed", total: 18000 }, { status: "void", total: 50000 }, { status: "completed", total: "7000" }])).toBe(25000);
    expect(countedTotal([{ status: "void", total: 50000 }])).toBe(0);
    expect(countedTotal([])).toBe(0);
  });

  it("input: sale id must be a uuid, reason is trimmed and capped at 200", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(VoidSaleInput.parse({ sale_id: id, reason: "  salah input  " })).toEqual({ sale_id: id, reason: "salah input" });
    expect(VoidSaleInput.parse({ sale_id: id })).toEqual({ sale_id: id, reason: "" });
    expect(VoidSaleInput.safeParse({ sale_id: "s1" }).success).toBe(false);
    const long = VoidSaleInput.safeParse({ sale_id: id, reason: "x".repeat(201) });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe("Alasan maksimal 200 karakter.");
  });

  it("result note says how many items went back to stock", () => {
    expect(voidResultNote({ already_void: false, restocked: 3 })).toBe("Transaksi dibatalkan. 3 barang kembali ke stok dan tidak dihitung di laporan.");
    expect(voidResultNote({ already_void: false, restocked: 0 })).toBe("Transaksi dibatalkan dan tidak dihitung di laporan.");
    expect(voidResultNote({ already_void: true, restocked: 0 })).toBe("Transaksi ini sudah dibatalkan sebelumnya.");
  });

  it("RPC errors read as plain Indonesian; a missing function (migration not applied) says so", () => {
    expect(voidSaleError(null)).toBeUndefined();
    expect(voidSaleError({ code: "42501", message: "your role" })).toBe("Hanya pemilik toko yang bisa membatalkan transaksi.");
    expect(voidSaleError({ code: "P0002" })).toBe("Transaksi tidak ditemukan.");
    expect(voidSaleError({ code: "55000" })).toBe("Transaksi ini tidak bisa dibatalkan.");
    expect(voidSaleError({ code: "PGRST202" })).toMatch(/belum aktif/);
    expect(voidSaleError({ code: "XX000", message: "boom" })).toBe("Pembatalan belum berhasil. Transaksi tidak berubah, coba lagi sebentar.");
  });
});
