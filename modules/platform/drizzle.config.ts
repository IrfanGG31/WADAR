import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// Absolute paths so this config works no matter the invoking process's cwd
// — required for `pnpm db:generate`/`db:push` to run from the repo root
// (see root package.json), which is itself required so drizzle-kit's
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
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: resolve(here, "./src/db/schema.ts"),
  out: resolve(here, "./drizzle"),
  dialect: "postgresql",
  schemaFilter: ["platform"],
  dbCredentials: {
    // Migrate role (superuser/table owner) — never DATABASE_URL (runtime,
    // non-privileged wadar_app) here. See
    // docs/adr/002-postgres-role-separation-for-rls.md.
    url: process.env.DATABASE_MIGRATE_URL ?? "postgres://wadar:wadar@localhost:5432/wadar",
  },
});
