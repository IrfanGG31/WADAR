import { describe, expect, it } from "vitest";
import {
  classifyExpiry,
  daysUntilExpiry,
  daysUntilExpiryAt,
  expiryAfterStockIn,
  expiryStatus,
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

describe("status lewat / hampir / aman", () => {
  it("lewat before today, hampir from today through N days, aman after", () => {
    expect(expiryStatus(-1)).toBe("lewat");
    expect(expiryStatus(0)).toBe("hampir");
    expect(expiryStatus(30)).toBe("hampir");
    expect(expiryStatus(31)).toBe("aman");
    expect(expiryStatus(7, 7)).toBe("hampir");
    expect(expiryStatus(8, 7)).toBe("aman");
  });

  it("classifies a date, null without one", () => {
    expect(classifyExpiry("2026-10-16", TODAY)).toEqual({ days: -1, status: "lewat" });
    expect(classifyExpiry("2026-11-16", TODAY)).toEqual({ days: 30, status: "hampir" });
    expect(classifyExpiry("2026-11-17", TODAY)).toEqual({ days: 31, status: "aman" });
    expect(classifyExpiry("2026-11-17", TODAY, 60)).toEqual({ days: 31, status: "hampir" });
    expect(classifyExpiry(null, TODAY)).toBeNull();
    expect(classifyExpiry(undefined, TODAY)).toBeNull();
    expect(classifyExpiry("", TODAY)).toBeNull();
    expect(classifyExpiry("bukan tanggal", TODAY)).toBeNull();
  });
});

describe("zona waktu toko", () => {
  // 16 Okt 2026 17:30 UTC = 17 Okt 00:30 WIB = 01:30 WITA = 02:30 WIT.
  const justAfterMidnightWib = new Date("2026-10-16T17:30:00Z");

  it("counts from the shop's own date, not the server's UTC date", () => {
    expect(daysUntilExpiryAt("2026-10-17", justAfterMidnightWib, "Asia/Jakarta")).toBe(0);
    expect(daysUntilExpiryAt("2026-10-17", justAfterMidnightWib, "UTC")).toBe(1);
    expect(daysUntilExpiryAt("2026-10-16", justAfterMidnightWib, "Asia/Jayapura")).toBe(-1);
  });

  it("a date turns lewat at the shop's midnight", () => {
    const beforeMidnightWib = new Date("2026-10-17T16:59:00Z"); // 23:59 WIB, 17 Okt
    const afterMidnightWib = new Date("2026-10-17T17:00:00Z"); // 00:00 WIB, 18 Okt
    expect(daysUntilExpiryAt("2026-10-17", beforeMidnightWib, "Asia/Jakarta")).toBe(0);
    expect(daysUntilExpiryAt("2026-10-17", afterMidnightWib, "Asia/Jakarta")).toBe(-1);
    // 16:30 UTC = 23:30 WIB (still 17 Okt) but 00:30 WITA (already 18 Okt).
    expect(daysUntilExpiryAt("2026-10-17", new Date("2026-10-17T16:30:00Z"), "Asia/Makassar")).toBe(-1);
  });
});

describe("tanggal setelah stok masuk", () => {
  it("keeps the nearest date while old stock remains; an empty shelf takes the new batch's date", () => {
    expect(expiryAfterStockIn("2026-11-01", 5, "2027-03-01")).toBe("2026-11-01");
    expect(expiryAfterStockIn("2026-11-01", 5, "2026-10-25")).toBe("2026-10-25");
    expect(expiryAfterStockIn("2026-11-01", 0, "2027-03-01")).toBe("2027-03-01");
    expect(expiryAfterStockIn(null, 5, "2027-03-01")).toBe("2027-03-01");
    expect(expiryAfterStockIn("2026-11-01", 5, null)).toBe("2026-11-01");
    expect(expiryAfterStockIn(null, 0, null)).toBeNull();
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
      ["today", 0, "hampir"],
      ["edge", 30, "hampir"],
    ]);
    expect(expiryRisks([item({ expires_on: "2026-10-25" })], TODAY, 7)).toEqual([]);
  });

  it("most urgent first: longest overdue, then nearest; same day by name", () => {
    const risks = expiryRisks(
      [
        item({ variant_id: "b", title: "Toner", expires_on: "2026-10-20" }),
        item({ variant_id: "a", title: "Lip balm", expires_on: "2026-10-20" }),
        item({ variant_id: "c", expires_on: "2026-10-01" }),
        item({ variant_id: "d", expires_on: "2026-10-15" }),
      ],
      TODAY,
    );
    expect(risks.map((r) => r.variant_id)).toEqual(["c", "d", "a", "b"]);
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
