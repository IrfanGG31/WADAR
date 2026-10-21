import { describe, expect, it } from "vitest";
import { EXAMPLES, fillShop, isTourSegment, SCENES } from "./tour-script";

describe("juri tour script", () => {
  it("covers six scenes, each with lines and a reason", () => {
    expect(SCENES.map((s) => s.id)).toEqual(["beranda", "kasir", "stok", "chat", "keuangan", "konsultasi"]);
    for (const s of SCENES) {
      expect(s.lines.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(20);
    }
  });

  it("has a full example for every segment", () => {
    for (const ex of Object.values(EXAMPLES)) {
      expect(ex.week).toHaveLength(7);
      expect(ex.menu.length).toBeGreaterThanOrEqual(3);
      expect(ex.chat.answer).not.toBe("");
    }
  });

  it("fills the shop name and recognises segments", () => {
    expect(fillShop("Ini Beranda {toko}. {toko}!", "Warkop Cak Rafi")).toBe("Ini Beranda Warkop Cak Rafi. Warkop Cak Rafi!");
    expect(isTourSegment("madura")).toBe(true);
    expect(isTourSegment("skincare")).toBe(false);
  });
});
