import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "@/brand";
import { config } from "@/proxy";
import { AFTER_SIGN_IN_PATH } from "@/lib/routes";
import manifest from "./manifest";

/** Width and height from the PNG IHDR chunk (bytes 16–23), so a wrong-size icon fails the test. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(new URL(`../../public${file}`, import.meta.url));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("PWA manifest (TECH-SPEC §14)", () => {
  const m = manifest();

  it("takes name and colors from brand.ts", () => {
    expect(m.name).toBe(brand.name);
    expect(m.short_name).toBe(brand.shortName);
    expect(m.theme_color).toBe(brand.colors.primary);
    expect(m.background_color).toBe(brand.colors.background);
  });

  it("is an installable standalone app that opens the user's shop", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe(AFTER_SIGN_IN_PATH);
    expect(m.lang).toBe("id");
  });

  it("lists 192 and 512 icons, each as 'any' and 'maskable', with real file dimensions", () => {
    for (const size of [192, 512]) {
      for (const purpose of ["any", "maskable"]) {
        const icon = m.icons?.find((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
        expect(icon, `${purpose} ${size}`).toBeDefined();
        expect(icon?.type).toBe("image/png");
        expect(pngSize(icon!.src)).toEqual({ width: size, height: size });
      }
    }
  });

  it("ships the apple-touch-icon at 180x180", () => {
    expect(pngSize("/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });

  it("is reachable signed-out: the proxy matcher skips the manifest but still guards app pages", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/manifest.webmanifest")).toBe(false);
    expect(re.test("/icon-512.png")).toBe(false);
    expect(re.test("/glow-by-sari/beranda")).toBe(true);
  });
});
