/** The page public/sw.js shows when a page can't load offline (precached, public in src/proxy.ts). */
export const OFFLINE_PATH = "/offline";

/** One worker URL for app-shell caching and push (GAP #7); the slug only steers notification clicks. */
export function serviceWorkerUrl(slug: string): string {
  return `/sw.js?slug=${encodeURIComponent(slug)}`;
}
