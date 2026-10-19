import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * WADAR API keys: "wdr_<8 lowercase alnum prefix>_<32 base62 secret>". The prefix is stored and
 * shown (to tell keys apart); only the SHA-256 of the whole key is stored, so a leaked database
 * row cannot be replayed. The plain key is shown once, at creation.
 */
export const API_SCOPES = ["orders:write", "messages:write", "catalog:read", "summary:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABEL: Record<ApiScope, string> = {
  "orders:write": "Kirim pesanan",
  "messages:write": "Chat pembeli",
  "catalog:read": "Baca produk & stok",
  "summary:read": "Baca ringkasan penjualan",
};

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomFrom(alphabet: string, length: number): string {
  // Rejection sampling: no modulo bias.
  const out: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit) out.push(alphabet[b % alphabet.length] as string);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

export function hashApiKey(full: string): string {
  return createHash("sha256").update(full, "utf8").digest("hex");
}

export function generateApiKey(): { full: string; prefix: string; hash: string } {
  const prefix = `wdr_${randomFrom(ALNUM, 8)}`;
  const full = `${prefix}_${randomFrom(BASE62, 32)}`;
  return { full, prefix, hash: hashApiKey(full) };
}

const KEY_RE = /^(wdr_[a-z0-9]{8})_[A-Za-z0-9]{32}$/;

/** "Bearer wdr_…" or a bare key → { prefix, full }, or null. */
export function parseApiKey(header: string | null): { prefix: string; full: string } | null {
  const raw = header?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const m = raw.match(KEY_RE);
  return m ? { prefix: m[1] as string, full: raw } : null;
}

export function hashMatches(full: string, storedHex: string): boolean {
  const a = Buffer.from(hashApiKey(full), "hex");
  const b = Buffer.from(storedHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const NewApiKeyInput = z.object({
  name: z.string().trim().min(1, "Beri nama, mis. Bot WhatsApp.").max(60),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Pilih minimal satu izin."),
});
