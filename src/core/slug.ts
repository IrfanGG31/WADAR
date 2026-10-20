import { brand } from "@/brand";

/** Shop URL slug rules — must match the `tenants.slug` check constraint. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * First path segments that already belong to a static route, so a shop slug
 * equal to one of them would be shadowed (/offline, /privasi, …). Top-level
 * folders of `src/app` (route groups excluded) plus Next/PWA paths served from
 * the root; `slug.test.ts` fails when a new top-level route is missing here.
 */
export const RESERVED_SLUGS: readonly string[] = [
  // src/app
  "admin",
  "api",
  "auth",
  "masuk",
  "mulai",
  "offline",
  "onboarding",
  "privasi",
  "struk",
  "juri",
  "undangan",
  "w",
  // Next.js / PWA / public files
  "_next",
  "manifest.webmanifest",
  "sw.js",
  "favicon.ico",
];

const RESERVED = new Set(RESERVED_SLUGS);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.trim().toLowerCase());
}

/** "Kopi Dimas & Co." → "kopi-dimas-co" (max 40 chars, never ends with "-"). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Why a shop slug can't be used, or null when it can (Indonesian, shown as-is). */
export function slugProblem(slug: string): string | null {
  if (!isValidSlug(slug)) return "Alamat toko 3–40 huruf kecil, angka, atau tanda minus.";
  if (isReservedSlug(slug)) return `Alamat "${slug}" sudah dipakai halaman ${brand.shortName}. Pilih alamat lain.`;
  return null;
}
