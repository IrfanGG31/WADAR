import { z } from "zod";

/**
 * Official address for personal-data requests on /privasi (UU PDP). Set per deployment in
 * `NEXT_PUBLIC_PRIVACY_EMAIL` (inlined at build); never hardcoded. Without a valid value the
 * page says the address is not set yet and points to the in-app tools instead.
 */
export const PRIVACY_EMAIL_ENV = "NEXT_PUBLIC_PRIVACY_EMAIL";

const Email = z.email();

/** The configured address (trimmed, lowercased), or null when unset or not an email. */
export function privacyEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return Email.safeParse(value).success ? value : null;
}

/** `mailto:` link with a subject so requests are easy to sort. */
export function privacyMailto(email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent("Permintaan data pribadi")}`;
}
