import { describe, expect, it } from "vitest";
import { AFTER_SIGN_IN_PATH, safeNextPath, shopPath } from "./routes";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/glow-by-sari/beranda")).toBe("/glow-by-sari/beranda");
    expect(safeNextPath("/masuk/sandi-baru")).toBe("/masuk/sandi-baru");
  });

  it("rejects off-site and empty targets", () => {
    for (const target of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined]) {
      expect(safeNextPath(target)).toBe(AFTER_SIGN_IN_PATH);
    }
  });
});

describe("shopPath", () => {
  it("builds slug-scoped app paths", () => {
    expect(shopPath("kopi-dimas", "kasir")).toBe("/kopi-dimas/kasir");
  });
});
