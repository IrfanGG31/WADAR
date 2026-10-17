import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import type { PushResult, PushSubscriptionRow } from "@/core/notify";

/**
 * Web push without a payload (GAP #7): VAPID (RFC 8292) authenticates us to the browser's push
 * service; the service worker (public/sw.js) shows a fixed "Chat perlu dibalas" notice.
 * No payload = no message encryption (RFC 8291) and nothing about the buyer leaves the server.
 * Keys: `node scripts/vapid-keys.mjs` → env NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT (mailto:…). Never commit real keys.
 */
export interface VapidConfig {
  publicKey: string; // base64url, 65-byte uncompressed P-256 point (the browser's applicationServerKey)
  privateKey: string; // base64url, 32-byte scalar
  subject: string;
}

const TTL_SECONDS = 24 * 3600;
const JWT_LIFETIME_SECONDS = 12 * 3600;
const TIMEOUT_MS = 5000;

/** Push services of Chrome/Edge/Android (FCM), Firefox, Safari and Windows. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^[\w-]+\.push\.services\.mozilla\.com$/, /^([\w-]+\.)*push\.apple\.com$/, /^[\w-]+\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export function vapidConfigFromEnv(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
  return { publicKey: point.toString("base64url"), privateKey: jwk.d! };
}

export function vapidJwt(cfg: VapidConfig, audience: string, now: Date): string {
  const point = Buffer.from(cfg.publicKey, "base64url");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: cfg.privateKey, x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") },
    format: "jwk",
  });
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: audience, exp: Math.floor(now.getTime() / 1000) + JWT_LIFETIME_SECONDS, sub: cfg.subject })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

export async function sendWebPush(
  sub: PushSubscriptionRow,
  cfg: VapidConfig,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  if (!isPushEndpoint(sub.endpoint)) return "failed";
  try {
    const res = await fetchImpl(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${vapidJwt(cfg, new URL(sub.endpoint).origin, now)}, k=${cfg.publicKey}`,
        TTL: String(TTL_SECONDS),
        Urgency: "high",
        "Content-Length": "0",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
