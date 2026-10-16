import type { MetadataRoute } from "next";
import { brand } from "@/brand";
import { AFTER_SIGN_IN_PATH } from "@/lib/routes";

/**
 * Web app manifest (TECH-SPEC §14). Name and colors come from src/brand.ts.
 * `start_url` is /mulai, which resolves the signed-in user's shop (or sends a
 * signed-out one to /masuk), so one manifest serves every tenant.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: brand.name,
    short_name: brand.shortName,
    description: brand.tagline,
    lang: "id",
    start_url: AFTER_SIGN_IN_PATH,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.colors.background,
    theme_color: brand.colors.primary,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
