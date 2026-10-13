/** Where a signed-in user lands: resolves their shop, or sends them to /onboarding. */
export const AFTER_SIGN_IN_PATH = "/mulai";

/**
 * A `next` redirect target taken from a URL, restricted to same-site paths:
 * "https://evil.example", "//evil.example" and "/\\evil.example" would all
 * send a freshly signed-in user off-site.
 */
export function safeNextPath(requested: string | null | undefined): string {
  return requested && /^\/(?![/\\])/.test(requested) ? requested : AFTER_SIGN_IN_PATH;
}

/** App pages live under the shop slug: /<slug>/beranda, /<slug>/kasir, … */
export function shopPath(slug: string, page: string): string {
  return `/${encodeURIComponent(slug)}/${page}`;
}
