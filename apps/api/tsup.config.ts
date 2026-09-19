import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  clean: true,
  // Workspace packages ship raw TypeScript (no dist build step of their own —
  // see docs/BUILD-PLAN.md M0 plan notes), so `node dist/main.js` can't
  // resolve them at runtime unless they're bundled in here too. Everything
  // else in node_modules stays external as usual — which is also why
  // @wadar/platform's own runtime deps (pg, ioredis, bullmq, drizzle-orm,
  // uuidv7) are listed directly in THIS package's package.json too: once
  // their code is pulled in via noExternal, tsup only knows to keep them
  // external (rather than trying, and failing, to bundle native/CJS
  // packages like `pg`) if they're resolvable as this package's own deps.
  noExternal: [/^@wadar\//],
});
