import { describe, expect, it } from "vitest";
import { canResetDemo, interpretReset, wantsDemoReset } from "./demo-reset";

describe("demo reset gating", () => {
  it("is requested only by ?reset-demo=1", () => {
    expect(wantsDemoReset("1")).toBe(true);
    for (const v of [undefined, "", "0", "true", ["1"], ["1", "1"]]) expect(wantsDemoReset(v)).toBe(false);
  });

  it("is available only for demo shops", () => {
    expect(canResetDemo({ is_demo: true }, "1")).toBe(true);
    expect(canResetDemo({ is_demo: true }, undefined)).toBe(false);
    expect(canResetDemo({ is_demo: false }, "1")).toBe(false);
  });
});

describe("interpretReset", () => {
  it("accepts the same slug back", () => {
    expect(interpretReset({ data: "glow-by-sari", error: null }, "glow-by-sari")).toEqual({ ok: true, slug: "glow-by-sari" });
  });

  it("maps 42501 to the not-a-demo message and other errors to a retry message, in Indonesian", () => {
    expect(interpretReset({ data: null, error: { code: "42501" } }, "x")).toEqual({ ok: false, error: "Hanya toko demo yang bisa di-reset." });
    const other = interpretReset({ data: null, error: { code: "57014" } }, "x");
    expect(other.ok).toBe(false);
    expect(other.ok === false && other.error).toContain("Datamu tidak berubah");
  });

  it("refuses a result whose slug differs from the shop that was reset", () => {
    expect(interpretReset({ data: "glow-by-sari-ab12c", error: null }, "glow-by-sari").ok).toBe(false);
    expect(interpretReset({ data: null, error: null }, "glow-by-sari").ok).toBe(false);
  });
});
