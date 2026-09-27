import { defineConfig } from "drizzle-kit";

// Repo-root-relative paths — see modules/platform/drizzle.config.ts.

export default defineConfig({
  schema: "./modules/insights/src/db/schema.ts",
  out: "./modules/insights/drizzle",
  dialect: "postgresql",
  schemaFilter: ["insights"],
  // One tracking table per module: drizzle-kit migrate skips any migration
  // older than the newest row in its table, so a shared table would make
  // one module silently skip another module's earlier migrations.
  migrations: { table: "__drizzle_migrations_insights", schema: "drizzle" },
  dbCredentials: {
    // Migrate role (superuser/table owner) — never DATABASE_URL (runtime,
    // non-privileged wadar_app) here. See
    // docs/adr/002-postgres-role-separation-for-rls.md.
    url: process.env.DATABASE_MIGRATE_URL ?? "postgres://wadar:wadar@localhost:5432/wadar",
  },
});
