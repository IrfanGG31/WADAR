import { describe, expect, it } from "vitest";
import { DEMO_PROFILES, DEMO_SHOPS, dayStory, parseDemoProfile, SEGMENT_PROFILES } from "./demo-profiles";
import { formatDuration, weeklyImpact } from "./impact";
import { crc16ccitt, qrisDemoPayload } from "./qris";

describe("demo profiles", () => {
  it("accepts the five profiles and falls back to skincare", () => {
    for (const p of DEMO_PROFILES) expect(parseDemoProfile(p)).toBe(p);
    expect(parseDemoProfile("kopi'; drop")).toBe("skincare");
    expect(parseDemoProfile(undefined)).toBe("skincare");
  });

  it("puts the current owner name in the day story", () => {
    expect(dayStory("warkop", "Cak Rafi").some((m) => m.body.includes("Cak Rafi tetap di dapur"))).toBe(true);
    expect(dayStory("madura", "  ").some((m) => m.body.includes("Cak Mat tinggal antar"))).toBe(true);
    expect(dayStory("penyetan", "X").every((m) => !m.body.includes("{pemilik}"))).toBe(true);
  });

  it("segment demos tell a full day, each moment pointing at a page", () => {
    for (const p of SEGMENT_PROFILES) {
      expect(DEMO_SHOPS[p].day.length).toBeGreaterThanOrEqual(5);
      for (const m of DEMO_SHOPS[p].day) expect(m.page).toMatch(/^[a-z/]+$/);
    }
  });
});

describe("weekly impact", () => {
  it("adds sales, chat replies and daily recaps in whole minutes", () => {
    expect(weeklyImpact({ sales: 600, aiReplies: 40, days: 7 })).toEqual({
      minutesFromSales: 400,
      minutesFromChat: 60,
      minutesFromRecap: 140,
      minutesTotal: 600,
    });
  });

  it("ignores negative or broken counts", () => {
    expect(weeklyImpact({ sales: -3, aiReplies: Number.NaN, days: 0 }).minutesTotal).toBe(0);
  });

  it("formats minutes as jam with one decimal", () => {
    expect(formatDuration(45)).toBe("45 menit");
    expect(formatDuration(600)).toBe("10 jam");
    expect(formatDuration(754)).toBe("12,6 jam");
  });
});

describe("QRIS demo payload", () => {
  it("computes CRC16-CCITT (FFFF) like the EMVCo spec", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });

  it("is a dynamic QR with the amount and a valid checksum", () => {
    const p = qrisDemoPayload({ merchantName: "Warkop Mas Bayu", city: "Surabaya", amount: 15000, reference: "TX-ABC123" });
    expect(p.startsWith("000201010212")).toBe(true);
    expect(p).toContain("540515000");
    expect(p).toContain("5915WARKOP MAS BAYU");
    expect(p).toContain("ID.WADAR.DEMO");
    expect(p.slice(-4)).toBe(crc16ccitt(p.slice(0, -4)));
  });

  it("without an amount it is static (buyer types it)", () => {
    const p = qrisDemoPayload({ merchantName: "Toko", city: "Jakarta", amount: 0, reference: "x" });
    expect(p.startsWith("000201010211")).toBe(true);
    expect(p).not.toMatch(/54\d{2}\d+58/);
  });
});
