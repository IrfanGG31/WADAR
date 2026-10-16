import { describe, expect, it } from "vitest";
import { clientIp, createMemoryRateLimiter, widgetBuckets } from "./rate-limit";

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip, then null", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("createMemoryRateLimiter", () => {
  const now = 1_000_000;
  it("limits when any bucket is full and records nothing for a rejected hit", async () => {
    const rl = createMemoryRateLimiter();
    const b = [{ key: "a", limit: 2 }, { key: "b", limit: 5 }];
    expect((await rl.hit(b, now)).limited).toBe(false);
    expect((await rl.hit(b, now + 1)).limited).toBe(false);
    const third = await rl.hit(b, now + 2);
    expect(third).toEqual({ limited: true, retryAfterSeconds: 60 });
    // "b" only holds the two allowed hits: a request touching only "b" still has room.
    for (let i = 0; i < 3; i++) expect((await rl.hit([{ key: "b", limit: 5 }], now + 3)).limited).toBe(false);
    expect((await rl.hit([{ key: "b", limit: 5 }], now + 4)).limited).toBe(true);
  });
  it("frees the bucket once the window has passed", async () => {
    const rl = createMemoryRateLimiter();
    const b = [{ key: "a", limit: 1 }];
    await rl.hit(b, now);
    expect((await rl.hit(b, now + 59_000)).limited).toBe(true);
    expect((await rl.hit(b, now + 60_001)).limited).toBe(false);
  });
});

describe("widgetBuckets", () => {
  it("keys session, IP and shop separately per tenant", () => {
    const keys = widgetBuckets({ tenantId: "t1", sessionId: "s", ip: "1.2.3.4" }).map((b) => b.key);
    expect(keys).toEqual(["session:t1:s", "ip:t1:1.2.3.4", "tenant:t1"]);
    expect(widgetBuckets({ tenantId: "t1", sessionId: "s", ip: null })[1].key).toBe("ip:t1:unknown");
  });
});
