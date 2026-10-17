import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";

describe("struk publik route (POS-3)", () => {
  it("opens without a session, but only under /struk/", () => {
    expect(isPublicPath(`/struk/${"a".repeat(64)}`)).toBe(true);
    expect(isPublicPath("/toko-saya/kasir/riwayat")).toBe(false);
  });
});
