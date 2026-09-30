import { describe, expect, it } from "vitest";
import { MembershipCache } from "./membership-cache.js";

const membership = (tenantId: string, userId: string, roleKey = "owner") =>
  ({ membershipId: `m-${tenantId}-${userId}`, tenantId, userId, roleId: "r", roleKey, roleName: roleKey }) as never;

describe("MembershipCache", () => {
  it("returns a cached membership until it expires", () => {
    let now = 1_000;
    const cache = new MembershipCache(15_000, 100, () => now);
    cache.set(membership("t1", "u1"));
    expect(cache.get("t1", "u1")).toMatchObject({ tenantId: "t1", userId: "u1" });
    now += 14_999;
    expect(cache.get("t1", "u1")).toBeDefined();
    now += 1;
    expect(cache.get("t1", "u1")).toBeUndefined();
  });

  it("never mixes tenants or users", () => {
    const cache = new MembershipCache();
    cache.set(membership("t1", "u1"));
    expect(cache.get("t2", "u1")).toBeUndefined();
    expect(cache.get("t1", "u2")).toBeUndefined();
  });

  it("drops a whole tenant on invalidation (role change) and leaves other tenants alone", () => {
    const cache = new MembershipCache();
    cache.set(membership("t1", "u1"));
    cache.set(membership("t1", "u2"));
    cache.set(membership("t2", "u1"));
    cache.invalidateTenant("t1");
    expect(cache.get("t1", "u1")).toBeUndefined();
    expect(cache.get("t1", "u2")).toBeUndefined();
    expect(cache.get("t2", "u1")).toBeDefined();
  });

  it("evicts the least recently stored entry beyond its size limit", () => {
    const cache = new MembershipCache(15_000, 2);
    cache.set(membership("t1", "u1"));
    cache.set(membership("t1", "u2"));
    cache.set(membership("t1", "u3"));
    expect(cache.get("t1", "u1")).toBeUndefined();
    expect(cache.get("t1", "u3")).toBeDefined();
  });
});
