/**
 * Pure invitation-acceptability rules — no I/O, no token generation (that
 * needs randomness, so it lives in `application/invite-member.ts` instead;
 * `.dependency-cruiser.cjs`'s `domain-allowlist-direct` rule forbids
 * `domain/` from importing `node:crypto` or anything outside
 * packages/contracts, packages/core, zod, and other domain/ files).
 */
export const INVITATION_TTL_HOURS = 72;

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface InvitationAcceptabilityInput {
  status: InvitationStatus;
  expiresAt: Date;
}

export function isInvitationAcceptable(
  invitation: InvitationAcceptabilityInput,
  now: Date = new Date(),
): boolean {
  return invitation.status === "pending" && invitation.expiresAt.getTime() > now.getTime();
}

export function computeInvitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}
