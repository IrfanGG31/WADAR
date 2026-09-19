import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every @wadar/* workspace package ships raw, untranspiled TS/TSX (no
  // build step of its own — same pattern repo-wide); @wadar/ui-web also has
  // actual JSX to transform. Next excludes node_modules (including
  // symlinked workspace packages) from its default transform, so this
  // app's own compiler must be told to include them.
  //
  // Separately (found by actually running `next build` — production,
  // Turbopack — not just `tsc --noEmit`, which doesn't catch this at all):
  // @wadar/contracts and @wadar/core are ALSO consumed by the NodeNext
  // backend (apps/api, apps/worker, modules/*), so their own source keeps
  // `.js`-suffixed relative imports (required there — Node's ESM loader
  // and `tsc --noEmit` under `moduleResolution: nodenext` both reject a
  // missing extension). Turbopack, unlike esbuild (which tsx/tsup use),
  // does NOT resolve an explicit `./foo.js` specifier to an existing
  // `./foo.ts` file — not even with transpilePackages, and not with the
  // webpack-equivalent `experimental.extensionAlias` config either (both
  // tried and confirmed insufficient). Rather than fork these packages'
  // import convention by consumer, apps/web imports them via explicit
  // subpath exports (`@wadar/core/date`, `@wadar/contracts/identity` —
  // see each package's package.json `exports`) that map straight to a
  // single leaf file with no further relative imports of its own, instead
  // of through their root barrel (`export * from "./foo.js"`), so
  // Turbopack never has to perform that resolution at all.
  transpilePackages: ["@wadar/ui-web", "@wadar/contracts", "@wadar/core", "@wadar/brand"],
};

export default nextConfig;
