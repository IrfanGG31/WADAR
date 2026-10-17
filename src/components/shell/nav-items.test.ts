import { describe, expect, it } from "vitest";
import { DESKTOP_NAV, MOBILE_NAV, MORE_NAV, currentPage, isActive, navFor } from "./nav-items";

describe("shell navigation (PRD §7.2)", () => {
  it("has the 5 mobile tabs and 8 desktop items in order", () => {
    expect(MOBILE_NAV.map((i) => i.label)).toEqual(["Beranda", "Transaksi", "Laporan", "Chat AI", "Lainnya"]);
    expect(DESKTOP_NAV.map((i) => i.label)).toEqual([
      "Beranda",
      "Penjualan",
      "Stok",
      "Keuangan",
      "Pelanggan",
      "Chat AI",
      "Konsultasi Bisnis",
      "Pengaturan",
    ]);
  });

  it("makes every desktop page reachable on mobile (tab or Lainnya)", () => {
    const reachable = new Set([...MOBILE_NAV.map((i) => i.page), ...MORE_NAV.map((i) => i.page)]);
    for (const item of DESKTOP_NAV) expect(reachable).toContain(item.page);
  });

  it("reads the page segment after the shop slug", () => {
    expect(currentPage("/glow-by-sari/kasir")).toBe("kasir");
    expect(currentPage("/glow-by-sari/stok/123")).toBe("stok");
    expect(currentPage("/glow-by-sari")).toBeUndefined();
  });

  it("lights up grouped tabs", () => {
    const laporan = MOBILE_NAV.find((i) => i.label === "Laporan")!;
    expect(isActive(laporan, "stok")).toBe(true);
    expect(isActive(laporan, "keuangan")).toBe(true);
    expect(isActive(laporan, "kasir")).toBe(false);
  });
});

describe("navFor (CON-6 menu per role)", () => {
  const pages = (items: typeof DESKTOP_NAV) => items.map((i) => i.page);

  it("the owner keeps every item", () => {
    expect(navFor(DESKTOP_NAV, "owner")).toEqual(DESKTOP_NAV);
    expect(navFor(MOBILE_NAV, "owner")).toEqual(MOBILE_NAV);
  });

  it("a cashier sees no Keuangan, Chat, Konsultasi or Pengaturan", () => {
    expect(pages(navFor(DESKTOP_NAV, "cashier"))).toEqual(["beranda", "kasir", "stok", "pelanggan"]);
    expect(pages(navFor(MOBILE_NAV, "cashier"))).toEqual(["beranda", "kasir", "lainnya"]);
    expect(pages(navFor(MORE_NAV, "cashier"))).toEqual(["stok", "pelanggan"]);
  });

  it("a chat admin sees the inbox but not the till or the money pages", () => {
    expect(pages(navFor(DESKTOP_NAV, "chat_admin"))).toEqual(["beranda", "stok", "pelanggan", "chat"]);
  });

  it("no role = no items", () => {
    expect(navFor(DESKTOP_NAV, null)).toEqual([]);
  });
});
