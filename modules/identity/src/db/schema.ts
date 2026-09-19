import { tenantRlsPolicy } from "@wadar/platform";
import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgPolicy,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const identitySchema = pgSchema("identity");

export const tenantTimezone = pgEnum("tenant_timezone", [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
]);

export const systemRoleKey = pgEnum("system_role_key", [
  "owner",
  "manager",
  "cashier",
  "chat_admin",
  "warehouse",
]);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

/**
 * The root aggregate — deliberately has NO `tenant_id` column and NO RLS (it
 * IS the tenant). Access control for "which tenants can this user see" is
 * an application-level join through `memberships`, not a Postgres policy.
 */
export const tenants = identitySchema.table("tenants", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  timezone: tenantTimezone("timezone").notNull().default("Asia/Jakarta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outlets = identitySchema.table(
  "outlets",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("outlets_tenant_id_idx").on(table.tenantId), tenantRlsPolicy(table.tenantId)],
).enableRLS();

/**
 * 5 system roles seeded per tenant at `create-tenant` time
 * (`application/create-tenant.ts`) — not user-creatable in M1 (design
 * decision #5, docs/ARCHITECTURE.md §9).
 */
export const roles = identitySchema.table(
  "roles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: systemRoleKey("key").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("roles_tenant_id_idx").on(table.tenantId),
    uniqueIndex("roles_tenant_id_key_idx").on(table.tenantId, table.key),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/**
 * Accepted members only — a pending invite lives in `invitations` until
 * accepted. `userId` references Supabase Auth's `auth.users.id`, stored as
 * a plain uuid (not a real FK: `auth` is Supabase's schema, not ours, and
 * cross-schema FKs to a schema we don't own/migrate would break if Supabase
 * ever changes it — validated at the application layer via the verified
 * JWT's `sub` claim instead, see `http/supabase-jwt.guard.ts`).
 */
export const memberships = identitySchema.table(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("memberships_tenant_id_idx").on(table.tenantId),
    uniqueIndex("memberships_tenant_id_user_id_idx").on(table.tenantId, table.userId),
    tenantRlsPolicy(table.tenantId),
  ],
).enableRLS();

/**
 * `token` doubles as the accept-link secret AND, deliberately, as a second
 * narrow RLS escape hatch (`invitation_token_lookup` policy below) — the
 * one legitimate case of reading this RLS-protected table before the
 * caller has a known tenant context (the person accepting an invite isn't
 * a member of the tenant yet). See `application/accept-invitation.ts`.
 */
export const invitations = identitySchema.table(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email"),
    phone: text("phone"),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    token: text("token").notNull(),
    status: invitationStatus("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invitations_tenant_id_idx").on(table.tenantId),
    uniqueIndex("invitations_token_idx").on(table.token),
    tenantRlsPolicy(table.tenantId),
    // Narrow, deliberate exception (docs/adr/002 doesn't cover this — see
    // the comment above the table): permits SELECT of the exact row whose
    // token matches `app.invitation_lookup_token`, regardless of tenant.
    // `missing_ok: true` here (unlike the tenant policy) is intentional —
    // this policy should just not match (not throw) for every OTHER
    // tenant-scoped query that never sets this config var. Multiple
    // PERMISSIVE policies for the same command OR together in Postgres, so
    // this only WIDENS access for SELECT (an exact-token match), never
    // narrows the standard tenant_isolation policy, and it grants no
    // INSERT/UPDATE/DELETE capability at all (`for: "select"` only).
    pgPolicy("invitation_token_lookup", {
      for: "select",
      using: sql`${table.token} = current_setting('app.invitation_lookup_token', true)`,
    }),
  ],
).enableRLS();
