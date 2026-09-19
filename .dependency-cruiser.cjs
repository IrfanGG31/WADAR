/**
 * @type {import('dependency-cruiser').IConfiguration}
 *
 * Enforces docs/ARCHITECTURE.md §13 module boundaries. See
 * modules/platform/README.md "dependency-cruiser limits" for what this
 * config CANNOT catch (NestJS DI cross-module access, raw SQL schema
 * literals, apps/** containing business logic) — those stay manual-review
 * items, not lint failures.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make modules impossible to extract into separate services later (ARCHITECTURE §12.1).",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "Import points at a module that cannot be resolved (typo, missing dependency).",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-cross-module-internals",
      severity: "error",
      comment:
        "modules/A may only import another module's public.ts — never its domain/application/infra/http/db files directly (CLAUDE.md aturan #1). " +
        "Note: public.ts lives at modules/X/src/public.ts, not modules/X/public.ts — the pathNot below matches on the '/public.ts' suffix " +
        "regardless of nesting depth, not a bare 'public.ts' segment straight under modules/X/ (a first version of this rule got that wrong; " +
        "it went uncaught through M0 because M0 only ever had one module, so no cross-module edge existed yet to exercise the exception).",
      from: { path: "^modules/([^/]+)/" },
      to: {
        path: "^modules/[^/]+/.+",
        pathNot: ["^modules/$1/", "/public\\.ts$"],
      },
    },
    {
      name: "domain-allowlist-direct",
      severity: "error",
      comment:
        "domain/ may only depend on packages/contracts, packages/core, Zod, other domain/ files, and vitest (test-only, not shipped) directly — " +
        "an allow-list, not a framework blocklist, so a new infra dependency (pg, ioredis, ...) can't sneak in unnoticed even inside a *.test.ts file. " +
        "Went uncaught through M0 for the same reason as the no-cross-module-internals fix above: platform (M0's only module) never had a domain/ " +
        "directory at all, so no domain-level *.test.ts file existed yet to exercise this.",
      from: { path: "/domain/" },
      to: {
        pathNot: [
          "^packages/contracts/",
          "^packages/core/",
          "node_modules/zod/",
          "node_modules/vitest/",
          "/domain/",
        ],
      },
    },
    {
      name: "domain-no-transitive-infra-leak",
      severity: "error",
      comment:
        "domain/ must never reach infra/, http/, or a framework package even through an intermediary file — a direct-edge check alone would miss domain -> harmless-file -> infra.",
      from: { path: "/domain/" },
      to: {
        path: "(/infra/|/http/|node_modules/(@nestjs|fastify|drizzle-orm|pg|ioredis|bullmq)/)",
        reachable: true,
      },
    },
    {
      name: "web-no-modules-import",
      severity: "error",
      comment:
        "apps/web talks to the API over REST/SDK only, never in-process (ARCHITECTURE §4.1) — importing modules/* would leak server-only code (DB clients, secrets) toward the client bundle.",
      from: { path: "^apps/web/" },
      to: { path: "^modules/" },
    },
    {
      name: "packages-no-modules-or-apps",
      severity: "error",
      comment: "packages/* are leaf dependencies — they must not import modules/* or apps/* (ARCHITECTURE §13).",
      from: { path: "^packages/" },
      to: { path: "^(modules|apps)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
