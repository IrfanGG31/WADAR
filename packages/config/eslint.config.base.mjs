// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config (ESLint 10 requires flat config — see docs/BUILD-PLAN.md M0
 * dependency versions table). Each app/package/module composes this with its own overrides.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
