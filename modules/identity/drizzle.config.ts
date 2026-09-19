import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["identity"],
  dbCredentials: {
    // Migrate role (superuser/table owner) — never DATABASE_URL (runtime,
    // non-privileged wadar_app) here. See
    // docs/adr/002-postgres-role-separation-for-rls.md.
    url: process.env.DATABASE_MIGRATE_URL ?? "postgres://wadar:wadar@localhost:5432/wadar",
  },
});
