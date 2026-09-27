import { describe, expect, it } from "vitest";
import { balanceSentence, moneyInSentence, percentChange, profitSentence, stockAlertTitle, trendOf } from "./sentences.js";

describe("deterministic card sentences (no LLM, PRD §4)", () => {
  it("money in", () => {
    expect(moneyInSentence(0, 0)).toBe("Belum ada uang masuk hari ini maupun kemarin.");
    expect(moneyInSentence(0, 500_000)).toBe("Belum ada uang masuk hari ini. Kemarin seharian Rp500.000.");
    expect(moneyInSentence(250_000, 0)).toBe("Kemarin tidak ada uang masuk — hari ini sudah mulai.");
    expect(moneyInSentence(560_000, 500_000)).toBe("Sudah 12% di atas kemarin seharian (Rp500.000).");
    expect(moneyInSentence(200_000, 500_000)).toBe("Kemarin seharian Rp500.000 — hari ini masih berjalan.");
  });

  it("profit", () => {
    expect(profitSentence(0, 0, 0, 0)).toBe("Belum ada penjualan hari ini.");
    expect(profitSentence(100_000, 100_000, 0, 0)).toContain("(HPP) belum diisi");
    expect(profitSentence(-20_000, 100_000, 60_000, 60_000)).toBe("Pengeluaran Rp60.000 lebih besar dari untung penjualan hari ini.");
    expect(profitSentence(25_000, 100_000, 60_000, 15_000)).toBe("Dari setiap Rp100 penjualan, untungnya Rp25.");
  });

  it("balance, stock titles, trend", () => {
    expect(balanceSentence(1_000, 3)).toBe("Gabungan 3 dompet (kas laci, bank, QRIS, dll.).");
    expect(balanceSentence(1_000, 1)).toBe("Semua uangmu ada di 1 dompet.");
    expect(balanceSentence(0, 0)).toBe("Belum ada uang tercatat di dompet.");
    expect(balanceSentence(-1, 2)).toContain("minus");
    expect(stockAlertTitle("Serum", 6, 3)).toBe("Serum habis ±3 hari lagi");
    expect(stockAlertTitle("Serum", 0, 0)).toBe("Serum habis");
    expect(stockAlertTitle("Serum", -2, 0)).toBe("Stok Serum minus di sistem");
    expect(trendOf(5, 3)).toBe("up");
    expect(percentChange(5, 0)).toBeNull();
  });
});
