import { z } from "zod";

/**
 * Wire-level contract for identity's system role keys (CLAUDE.md aturan #9:
 * kontrak API hanya didefinisikan di packages/contracts). Values are
 * duplicated (not imported) from `modules/identity/src/domain/role.ts`'s
 * `SystemRole` enum on purpose — packages/contracts must never depend on
 * modules/* (`.dependency-cruiser.cjs` "packages-no-modules-or-apps"), so the
 * wire contract and the domain enum are two representations of the same 5
 * fixed roles (docs/ARCHITECTURE.md §9) that must be kept in sync by hand.
 */
export const SystemRoleKey = z.enum(["owner", "manager", "cashier", "chat_admin", "warehouse"]);
export type SystemRoleKey = z.infer<typeof SystemRoleKey>;

/** PRD X7 — the 3 Indonesian timezones a tenant can pick at signup. */
export const TenantTimezone = z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);
export type TenantTimezone = z.infer<typeof TenantTimezone>;

/**
 * Wire-level values for identity's `Permission` enum — same
 * duplicate-not-import relationship to `modules/identity/src/domain/role.ts`
 * as `SystemRoleKey` above. `GET /v1/memberships/me` returns these strings;
 * apps/web (banned from importing modules/*, ARCHITECTURE §13) filters nav
 * items against them using this list, not the domain enum.
 */
export const Permission = z.enum([
  "finance:view",
  "finance:manage",
  "catalog:manage",
  "inventory:manage",
  "orders:manage",
  "purchasing:manage",
  "cashier:operate",
  "assistant:use",
  "assistant:manage",
  "team:manage",
  "settings:manage",
]);
export type Permission = z.infer<typeof Permission>;

export const CreateTenantBody = z.object({
  tenantName: z.string().min(2).max(120),
  timezone: TenantTimezone.default("Asia/Jakarta"),
  outletName: z.string().min(2).max(120),
});
export type CreateTenantBody = z.infer<typeof CreateTenantBody>;

export const CreateOutletBody = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(500).optional(),
});
export type CreateOutletBody = z.infer<typeof CreateOutletBody>;

export const InviteMemberBody = z
  .object({
    email: z.email().optional(),
    phone: z.string().min(8).max(20).optional(),
    roleKey: SystemRoleKey,
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "email atau phone wajib diisi salah satu",
    path: ["email"],
  });
export type InviteMemberBody = z.infer<typeof InviteMemberBody>;

export const AcceptInvitationBody = z.object({
  token: z.string().min(16),
});
export type AcceptInvitationBody = z.infer<typeof AcceptInvitationBody>;

export const ChangeRoleBody = z.object({
  roleKey: SystemRoleKey,
});
export type ChangeRoleBody = z.infer<typeof ChangeRoleBody>;
