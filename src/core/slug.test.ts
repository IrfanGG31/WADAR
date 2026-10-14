import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases, strips accents and symbols", () => {
    expect(slugify("Kopi Dimas & Co.")).toBe("kopi-dimas-co");
    expect(slugify("  Glow by Sari  ")).toBe("glow-by-sari");
    expect(slugify("Café Señor")).toBe("cafe-senor");
  });

  it("caps at 40 chars without a trailing dash", () => {
    const slug = slugify("a".repeat(39) + " b c");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("matches the database constraint", () => {
    expect(isValidSlug("glow-by-sari")).toBe(true);
    expect(isValidSlug("ab")).toBe(false); // min 3
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("Abc")).toBe(false);
    expect(isValidSlug("a".repeat(41))).toBe(false);
  });
});
