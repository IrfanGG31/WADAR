import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// Absolute paths so this config works no matter the invoking process's cwd
// — see the identical comment in modules/platform/drizzle.config.ts for why
// this module must be invoked from the repo root.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: resolve(here, "./src/db/schema.ts"),
  out: resolve(here, "./drizzle"),
  dialect: "postgresql",
  schemaFilter: ["identity"],
  dbCredentials: {
    // Migrate role (superuser/table owner) — never DATABASE_URL (runtime,
    // non-privileged wadar_app) here. See
    // docs/adr/002-postgres-role-separation-for-rls.md.
    url: process.env.DATABASE_MIGRATE_URL ?? "postgres://wadar:wadar@localhost:5432/wadar",
  },
});
