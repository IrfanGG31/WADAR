# `identity` module

Tenants, outlets, memberships, roles, invitations — the tenant/auth boundary
every other module's `@TenantScoped()` route ultimately depends on. See
`docs/ARCHITECTURE.md` §3, §5.1, §9 and `docs/BUILD-PLAN.md` M1 for the full
design, and `docs/adr/002-postgres-role-separation-for-rls.md` for why RLS
here actually works (not just app-level filtering).

## No local `users` table

Supabase Auth's `auth.users` is authoritative. `memberships.user_id` is
stored as a plain `uuid` — not a real foreign key, since `auth` is
Supabase's own schema, not one this module migrates. The verified JWT's
`sub` claim (via `SupabaseJwtGuard`) is the only thing trusted to identify
a user; nothing here queries `auth.users` directly.

## The one deliberate RLS exception: invitation-token lookup

Accepting an invitation needs to look up `identity.invitations` by `token`
**before** the caller has any tenant context (they aren't a member yet —
that's exactly what accepting grants). `db/schema.ts`'s
`invitation_token_lookup` policy allows `SELECT` on the exact row matching
`current_setting('app.invitation_lookup_token', true)` — narrow (read-only,
one row, only when that specific config var is set, which nothing else in
this module ever sets) and additive to the standard tenant policy (multiple
PERMISSIVE Postgres policies OR together), not a general RLS bypass. See
`infra/invitations.repository.ts`'s `findInvitationByToken` and
`application/accept-invitation.ts`.

## Static RBAC, not dynamic

`domain/role.ts`'s `ROLE_PERMISSIONS` is a hardcoded map for the 5 fixed
system roles (Pemilik/Manajer/Kasir/Admin Chat/Gudang) — no per-tenant
custom roles or a dynamic permissions table in M1 scope. `packages/contracts`
duplicates (does not import) the same role/permission string values for the
wire contract, since packages/* can never depend on modules/* — kept in
sync by `domain/role-contracts-sync.test.ts`.

## OTP-HP: UI built, provider stubbed

Phone-number OTP has a complete UI/flow (`apps/web`'s `/masuk`), but
Supabase's SMS provider is left unconfigured (no account available at build
time) — submitting it surfaces whatever error Supabase returns rather than
pretending to work. Only email OTP and Google are covered by automated
(Playwright) tests for M1.
