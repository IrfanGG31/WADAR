import "server-only";
import { headers } from "next/headers";

/**
 * The address the owner is using WADAR from — what Telegram and Meta must call back. Webhooks need
 * it on public https; localhost and plain http cannot receive them.
 */
export async function requestOrigin(): Promise<{ origin: string; isPublicHttps: boolean }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.)/.test(host);
  return { origin: `${proto}://${host || "wadar.app"}`, isPublicHttps: proto === "https" && host !== "" && !local };
}
