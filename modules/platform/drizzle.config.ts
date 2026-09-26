import { defineConfig } from "drizzle-kit";

// Paths are relative to the REPO ROOT: drizzle-kit must always be invoked
// from there (see root package.json db:* scripts). Absolute paths don't work
// either — drizzle-kit prefixes "./" onto `out` when reading existing
// snapshots. Running from the root is itself required so drizzle-kit's
// tsconfig auto-discovery (`getTsconfig(process.cwd())`) finds the ROOT
// tsconfig.json (whose `include` spans every modules/**/src, packages/**/src)
// instead of this module's own tsconfig.json (whose `include: ["src"]` is
// too narrow to cover a cross-module import like identity/db/schema.ts's
// `tenantRlsPolicy` from @wadar/platform, which transitively bundles
// NestJS-decorated files outside modules/platform/src). Without this, esbuild
// silently drops `experimentalDecorators` for any file outside the
// discovered tsconfig's `include`, breaking on the first parameter decorator
// it hits ("Parameter decorators only work when experimental decorators are
// enabled") — found by actually running `pnpm db:generate` against this repo.

export default defineConfig({
  schema: "./modules/platform/src/db/schema.ts",
  out: "./modules/platform/drizzle",
  dialect: "postgresql",
  schemaFilter: ["platform"],
  // One tracking table per module: drizzle-kit migrate skips any migration
  // older than the newest row in its table, so a shared table would make
  // one module silently skip another module's earlier migrations.
  migrations: { table: "__drizzle_migrations_platform", schema: "drizzle" },
  dbCredentials: {
    // Migrate role (superuser/table owner) — never DATABASE_URL (runtime,
    // non-privileged wadar_app) here. See
    // docs/adr/002-postgres-role-separation-for-rls.md.
    url: process.env.DATABASE_MIGRATE_URL ?? "postgres://wadar:wadar@localhost:5432/wadar",
  },
});
