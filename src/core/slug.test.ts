import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isReservedSlug, isValidSlug, RESERVED_SLUGS, slugify, slugProblem } from "./slug";

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

describe("reserved slugs", () => {
  it("rejects static public pages and is case-insensitive", () => {
    for (const slug of ["offline", "privasi", "mulai", "masuk", "onboarding", "undangan", "api", "auth"]) {
      expect(isReservedSlug(slug)).toBe(true);
      expect(slugProblem(slug)).toMatch(/sudah dipakai halaman/);
    }
    expect(isReservedSlug("Offline")).toBe(true);
    expect(slugProblem("glow-by-sari")).toBeNull();
    expect(slugProblem("ab")).toMatch(/3–40/);
  });

  it("covers every top-level static route folder in src/app", () => {
    const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
    const segments = readdirSync(appDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) =>
        // Route groups "(app)" don't add a URL segment: look one level inside.
        e.name.startsWith("(")
          ? readdirSync(join(appDir, e.name), { withFileTypes: true })
              .filter((c) => c.isDirectory())
              .map((c) => c.name)
          : [e.name],
      )
      .filter((name) => !name.startsWith("[") && !name.startsWith("_"));
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) expect(RESERVED_SLUGS, segment).toContain(segment);
  });
});
