/**
 * Single source of truth for brand identity (CLAUDE.md aturan #10, PRD §14.1).
 * Rebranding WADAR means editing only this file — feature code must never
 * hardcode the name "WADAR" or brand colors directly.
 *
 * Colors/fonts below are placeholders (not yet finalized by design) — safe to
 * replace wholesale later without touching any feature module.
 */
export const brand = {
  name: "WADAR",
  tagline:
    "Bukan sekadar mencatat. WADAR mengawasi, memperingatkan, dan menjawab — supaya kamu tenang bisnismu hidup dan bergerak.",
  colors: {
    primary: "#0F766E",
    primaryForeground: "#F0FDFA",
    accent: "#F59E0B",
    background: "#FFFFFF",
    foreground: "#0F172A",
  },
  fonts: {
    sans: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, ui-monospace, monospace",
  },
} as const;

export type Brand = typeof brand;
