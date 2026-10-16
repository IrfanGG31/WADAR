import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = (p: string) => new URL(p, import.meta.url);

/** D8: every main page streams behind a placeholder and a failure never blanks the shell. */
describe("route states", () => {
  const MAIN_PAGES = ["beranda", "kasir", "stok", "keuangan", "pengaturan", "konsultasi"];

  it.each(MAIN_PAGES)("%s has a loading.tsx next to its page", (page) => {
    expect(existsSync(here(`./(app)/[slug]/${page}/page.tsx`))).toBe(true);
    expect(existsSync(here(`./(app)/[slug]/${page}/loading.tsx`))).toBe(true);
  });

  it("has an error boundary and a not-found inside the shop shell", () => {
    expect(existsSync(here("./(app)/[slug]/error.tsx"))).toBe(true);
    expect(existsSync(here("./(app)/[slug]/not-found.tsx"))).toBe(true);
  });

  it("has root fallbacks for unknown URLs and a failing root layout", () => {
    expect(existsSync(here("./not-found.tsx"))).toBe(true);
    expect(existsSync(here("./global-error.tsx"))).toBe(true);
  });
});
