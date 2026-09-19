import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brand } from "@wadar/brand";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf-8");

describe("theme.css matches @wadar/brand (CLAUDE.md aturan #10)", () => {
  it("contains every brand color's exact hex value", () => {
    for (const hex of Object.values(brand.colors)) {
      expect(themeCss.toLowerCase()).toContain(hex.toLowerCase());
    }
  });

  it("references the brand's font stacks", () => {
    expect(themeCss).toContain("Inter");
    expect(themeCss).toContain("JetBrains Mono");
  });
});
