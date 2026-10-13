/**
 * Single source of truth for brand identity. Feature code must never hardcode
 * the product name or brand colors — rebranding means editing only this file
 * (and the matching CSS tokens in src/app/globals.css, kept in sync by
 * src/brand.test.ts).
 */
export const brand = {
  name: "WADAR AI",
  shortName: "WADAR",
  tagline: "Asisten AI yang ngerti tokomu: bukan sekadar mencatat, tetapi memperingatkan dan menjawab.",
  colors: {
    primary: "#2563EB",
    primaryForeground: "#FFFFFF",
    accent: "#F59E0B",
    background: "#FFFFFF",
    foreground: "#0F172A",
  },
  /** Served from /public. */
  logo: {
    src: "/wadar-logo.png",
    alt: "Logo WADAR",
  },
} as const;

export type Brand = typeof brand;
