import { describe, expect, it } from "vitest";
import {
  daysUntilExpiry,
  DEFAULT_EXPIRY_WINDOW_DAYS,
  expiryRisks,
  formatExpiryDate,
  isIsoDay,
  narrateExpiry,
  narrateExpiryOverview,
  parseExpiryWindow,
  type ExpiryItem,
} from "./expiry";

const TODAY = "2026-10-17";

function item(over: Partial<ExpiryItem>): ExpiryItem {
  return { variant_id: "v1", title: "Serum 30ml", unit: "pcs", on_hand: 8, expires_on: null, ...over };
}

describe("hari menuju kedaluwarsa (STK-5)", () => {
  it("counts whole calendar days: 0 today, negative when past", () => {
    expect(daysUntilExpiry("2026-10-17", TODAY)).toBe(0);
    expect(daysUntilExpiry("2026-10-18", TODAY)).toBe(1);
    expect(daysUntilExpiry("2026-11-16", TODAY)).toBe(30);
    expect(daysUntilExpiry("2026-10-14", TODAY)).toBe(-3);
  });

  it("crosses month, year and leap day boundaries without drift", () => {
    expect(daysUntilExpiry("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntilExpiry("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysUntilExpiry("2027-03-01", "2027-02-28")).toBe(1);
    // DST does not exist in the date math (UTC day numbers).
    expect(daysUntilExpiry("2026-11-02", "2026-10-25")).toBe(8);
  });

  it("rejects malformed or impossible dates", () => {
    expect(daysUntilExpiry("2026-02-30", TODAY)).toBeNull();
    expect(daysUntilExpiry("17/10/2026", TODAY)).toBeNull();
    expect(isIsoDay("2026-10-17")).toBe(true);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("")).toBe(false);
  });

  it("window parameter: default 30, integers 1…365", () => {
    expect(DEFAULT_EXPIRY_WINDOW_DAYS).toBe(30);
    expect(parseExpiryWindow(undefined)).toBe(30);
    expect(parseExpiryWindow("14")).toBe(14);
    expect(parseExpiryWindow(["60", "7"])).toBe(60);
    expect(parseExpiryWindow("0")).toBe(30);
    expect(parseExpiryWindow("2.5")).toBe(30);
    expect(parseExpiryWindow("9999")).toBe(365);
  });
});

describe("daftar risiko kedaluwarsa", () => {
  it("warns for ≤ N days (inclusive) and past dates; skips no date, empty stock, later dates", () => {
    const risks = expiryRisks(
      [
        item({ variant_id: "past", title: "Toner", expires_on: "2026-10-10" }),
        item({ variant_id: "edge", title: "Sabun", expires_on: "2026-11-16" }),
        item({ variant_id: "later", expires_on: "2026-11-17" }),
        item({ variant_id: "nodate", expires_on: null }),
        item({ variant_id: "empty", expires_on: "2026-10-20", on_hand: 0 }),
        item({ variant_id: "today", title: "Masker", expires_on: TODAY }),
      ],
      TODAY,
    );
    expect(risks.map((r) => [r.variant_id, r.days, r.status])).toEqual([
      ["past", -7, "lewat"],
      ["today", 0, "segera"],
      ["edge", 30, "segera"],
    ]);
    expect(expiryRisks([item({ expires_on: "2026-10-25" })], TODAY, 7)).toEqual([]);
  });

  it("with a sell rate, estimates what is still unsold on the expiry day", () => {
    const [slow] = expiryRisks([item({ on_hand: 8, expires_on: "2026-10-27", rate: 0.5 })], TODAY);
    expect(slow.unsold_at_expiry).toBe(3); // 8 − 0,5 × 10
    const [fast] = expiryRisks([item({ on_hand: 8, expires_on: "2026-10-27", rate: 2 })], TODAY);
    expect(fast.unsold_at_expiry).toBe(0);
    const [unknown] = expiryRisks([item({ expires_on: "2026-10-27", rate: 0 })], TODAY);
    expect(unknown.unsold_at_expiry).toBeNull();
    const [past] = expiryRisks([item({ expires_on: "2026-10-01", rate: 3 })], TODAY);
    expect(past.unsold_at_expiry).toBe(8);
  });
});

describe("narasi kedaluwarsa", () => {
  it("formats dates the Indonesian way", () => {
    expect(formatExpiryDate("2026-10-29")).toBe("29 Okt 2026");
    expect(formatExpiryDate("2027-05-01")).toBe("1 Mei 2027");
  });

  it("says plainly what to do", () => {
    const [past, today, soon, cleared, noRate] = [
      item({ expires_on: "2026-10-14" }),
      item({ expires_on: TODAY }),
      item({ expires_on: "2026-10-29", rate: 0.25 }),
      item({ expires_on: "2026-10-29", rate: 1 }),
      item({ expires_on: "2026-10-29" }),
    ].map((i) => expiryRisks([i], TODAY)[0]);
    expect(narrateExpiry(past)).toBe("Serum 30ml sudah lewat tanggal kedaluwarsa 3 hari (14 Okt 2026), masih ada 8 pcs. Tarik dari rak dan jangan dijual.");
    expect(narrateExpiry(today)).toBe("Serum 30ml kedaluwarsa hari ini (17 Okt 2026), stok 8 pcs.");
    expect(narrateExpiry(soon)).toBe(
      "Serum 30ml kedaluwarsa 12 hari lagi (29 Okt 2026), stok 8 pcs. Dengan laju jual sekarang, ±5 pcs diperkirakan belum terjual saat itu — pertimbangkan promo atau bundling.",
    );
    expect(narrateExpiry(cleared)).toBe("Serum 30ml kedaluwarsa 12 hari lagi (29 Okt 2026), stok 8 pcs. Dengan laju jual sekarang, stok diperkirakan habis sebelum tanggal itu.");
    expect(narrateExpiry(noRate)).toBe("Serum 30ml kedaluwarsa 12 hari lagi (29 Okt 2026), stok 8 pcs.");
  });

  it("overview counts past and upcoming separately", () => {
    const risks = expiryRisks([item({ variant_id: "a", expires_on: "2026-10-01" }), item({ variant_id: "b", expires_on: "2026-10-20" }), item({ variant_id: "c", expires_on: "2026-10-21" })], TODAY);
    expect(narrateExpiryOverview(risks, 30)).toBe("1 produk sudah lewat tanggal kedaluwarsa dan 2 produk kedaluwarsa dalam 30 hari.");
    expect(narrateExpiryOverview([], 30)).toBeNull();
  });
});
