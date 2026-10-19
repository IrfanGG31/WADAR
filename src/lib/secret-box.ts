import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption for third-party credentials a shop enters (AI provider API key, later WhatsApp /
 * marketplace tokens). AES-256-GCM, done in the app server so the database only ever holds
 * ciphertext — and the ciphertext column is not readable by signed-in users at all (only the
 * service role reads it, see migration connect_hub).
 *
 * Key: WADAR_ENCRYPTION_KEY (32 bytes, base64) when set; otherwise derived with HKDF from
 * SUPABASE_SERVICE_ROLE_KEY, which is already a server-only secret, so setup needs no extra step.
 * Rotating the service-role key without setting WADAR_ENCRYPTION_KEY first makes stored
 * credentials unreadable (owners re-enter them; nothing else breaks).
 */

const VERSION = "v1";

export class SecretBoxUnavailableError extends Error {
  constructor() {
    super("No encryption key: set WADAR_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
}

export function encryptionKeyFrom(env: { WADAR_ENCRYPTION_KEY?: string; SUPABASE_SERVICE_ROLE_KEY?: string }): Buffer | null {
  const explicit = env.WADAR_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== 32) throw new Error("WADAR_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  const base = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) return null;
  return Buffer.from(hkdfSync("sha256", base, "wadar", "wadar-integrations-v1", 32));
}

function keyOrThrow(key?: Buffer | null): Buffer {
  const k = key ?? encryptionKeyFrom({ WADAR_ENCRYPTION_KEY: process.env.WADAR_ENCRYPTION_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
  if (!k) throw new SecretBoxUnavailableError();
  return k;
}

/** "v1.<iv>.<tag>.<ciphertext>", base64url parts. */
export function sealSecret(plain: string, key?: Buffer | null): string {
  const k = keyOrThrow(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

/** Throws when the box was sealed with another key or tampered with. */
export function openSecret(sealed: string, key?: Buffer | null): string {
  const [version, iv, tag, ct] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyOrThrow(key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** "sk-…a1b2": what the settings page may show of a key. */
export function secretHint(plain: string): string {
  const t = plain.trim();
  return t.length <= 8 ? "••••" : `${t.slice(0, 3)}…${t.slice(-4)}`;
}
