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
    primary: "#1F5FBF",
    primaryForeground: "#FFFFFF",
    navy: "#082A5C",
    accent: "#3793F2",
    background: "#FFFFFF",
    foreground: "#0B1D3A",
  },
  /** Served from /public. */
  logo: {
    src: "/wadar-logo.png",
    alt: "Logo WADAR",
  },
  /** The W symbol alone (cropped from the logo), for headers next to the name. 168×99. */
  mark: {
    src: "/wadar-mark.png",
    width: 168,
    height: 99,
  },
} as const;

export type Brand = typeof brand;
