import { describe, expect, it } from "vitest";
import { DESKTOP_NAV, MOBILE_NAV, MORE_NAV, currentPage, isActive } from "./nav-items";

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
