import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateVapidKeys, isPushEndpoint, sendWebPush, vapidConfigFromEnv, vapidJwt } from "./web-push";

const keys = generateVapidKeys();
const cfg = { subject: "mailto:owner@example.com", publicKey: keys.publicKey, privateKey: keys.privateKey };
const SUB = { id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/abc123" };
const NOW = new Date("2026-10-17T10:00:00Z");

const b64 = (s: string) => Buffer.from(s, "base64url");

describe("VAPID (RFC 8292) — payload-less web push for escalations (GAP #7)", () => {
  it("generates a P-256 key pair in the browser format (65-byte public point, 32-byte private)", () => {
    expect(b64(keys.publicKey)).toHaveLength(65);
    expect(b64(keys.publicKey)[0]).toBe(4);
    expect(b64(keys.privateKey)).toHaveLength(32);
  });

  it("signs an ES256 JWT for the push service's origin that verifies with the public key", () => {
    const jwt = vapidJwt(cfg, "https://fcm.googleapis.com", NOW);
    const [h, p, sig] = jwt.split(".");
    expect(JSON.parse(b64(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(b64(p).toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: NOW.getTime() / 1000 + 12 * 3600, sub: "mailto:owner@example.com" });
    const pub = b64(keys.publicKey);
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") },
      format: "jwk",
    });
    expect(verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, b64(sig))).toBe(true);
  });

  it("POSTs an empty push with the VAPID header; 201 = sent", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const r = await sendWebPush(SUB, cfg, NOW, async (url, init) => {
      seen.push({ url: String(url), init: init! });
      return new Response(null, { status: 201 });
    });
    expect(r).toBe("sent");
    expect(seen[0].url).toBe(SUB.endpoint);
    const headers = seen[0].init.headers as Record<string, string>;
    expect(seen[0].init.method).toBe("POST");
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    expect(headers.TTL).toBe("86400");
    expect(headers.Urgency).toBe("high");
    expect(headers["Content-Length"]).toBe("0");
  });

  it("404/410 = the device unsubscribed (remove it); other errors and network failures = failed", async () => {
    expect(await sendWebPush(SUB, cfg, NOW, async () => new Response(null, { status: 410 }))).toBe("gone");
    expect(await sendWebPush(SUB, cfg, NOW, async () => new Response(null, { status: 404 }))).toBe("gone");
    expect(await sendWebPush(SUB, cfg, NOW, async () => new Response(null, { status: 500 }))).toBe("failed");
    expect(
      await sendWebPush(SUB, cfg, NOW, async () => {
        throw new Error("offline");
      }),
    ).toBe("failed");
  });

  it("only https endpoints of known push services are contacted (no SSRF via a stored endpoint)", async () => {
    let called = 0;
    const ok = async () => {
      called++;
      return new Response(null, { status: 201 });
    };
    expect(await sendWebPush({ id: "x", endpoint: "http://169.254.169.254/latest" }, cfg, NOW, ok)).toBe("failed");
    expect(await sendWebPush({ id: "x", endpoint: "https://evil.example/push" }, cfg, NOW, ok)).toBe("failed");
    expect(await sendWebPush({ id: "x", endpoint: "https://fcm.googleapis.com.evil.example/x" }, cfg, NOW, ok)).toBe("failed");
    expect(called).toBe(0);
    for (const endpoint of [
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=1",
    ]) {
      expect(isPushEndpoint(endpoint)).toBe(true);
    }
  });

  it("env: all three VAPID values or none (in-app notifications only)", () => {
    expect(vapidConfigFromEnv({})).toBeNull();
    expect(vapidConfigFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })).toBeNull();
    expect(
      vapidConfigFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:a@b.co" }),
    ).toEqual({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:a@b.co" });
  });
});
