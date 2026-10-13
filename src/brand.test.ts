import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "./brand";

const globalsCss = readFileSync(new URL("./app/globals.css", import.meta.url), "utf-8").toLowerCase();

describe("globals.css matches src/brand.ts", () => {
  it("contains every brand color's exact hex value", () => {
    for (const hex of Object.values(brand.colors)) {
      expect(globalsCss).toContain(hex.toLowerCase());
    }
  });
});
