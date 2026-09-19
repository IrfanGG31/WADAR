import { describe, expect, it } from "vitest";
import { INVITATION_TTL_HOURS, computeInvitationExpiry, isInvitationAcceptable } from "./invitation.js";

describe("isInvitationAcceptable", () => {
  const now = new Date("2026-09-19T00:00:00Z");

  it("accepts a pending, not-yet-expired invitation", () => {
    expect(
      isInvitationAcceptable({ status: "pending", expiresAt: new Date("2026-09-20T00:00:00Z") }, now),
    ).toBe(true);
  });

  it("rejects an expired invitation even if still marked pending", () => {
    expect(
      isInvitationAcceptable({ status: "pending", expiresAt: new Date("2026-09-18T00:00:00Z") }, now),
    ).toBe(false);
  });

  it("rejects an already-accepted invitation (no re-use)", () => {
    expect(
      isInvitationAcceptable({ status: "accepted", expiresAt: new Date("2026-09-20T00:00:00Z") }, now),
    ).toBe(false);
  });

  it("rejects a revoked invitation", () => {
    expect(
      isInvitationAcceptable({ status: "revoked", expiresAt: new Date("2026-09-20T00:00:00Z") }, now),
    ).toBe(false);
  });

  it("rejects an explicitly expired-status invitation", () => {
    expect(
      isInvitationAcceptable({ status: "expired", expiresAt: new Date("2026-09-20T00:00:00Z") }, now),
    ).toBe(false);
  });

  it("treats the exact expiry instant as already expired (strict >, not >=)", () => {
    expect(isInvitationAcceptable({ status: "pending", expiresAt: now }, now)).toBe(false);
  });
});

describe("computeInvitationExpiry", () => {
  it("adds exactly INVITATION_TTL_HOURS to the given instant", () => {
    const from = new Date("2026-09-19T00:00:00Z");
    const expiry = computeInvitationExpiry(from);
    expect(expiry.getTime() - from.getTime()).toBe(INVITATION_TTL_HOURS * 60 * 60 * 1000);
  });
});
