import base from "@wadar/config/eslint";

export default [
  ...base,
  {
    // Node CommonJS config file (no "type": "module" in this package's
    // package.json, so `.js` here means CJS) — the shared base config
    // assumes ESM globals, so `module`/`require` need to be declared
    // explicitly just for this one file rather than loosened repo-wide.
    files: ["lighthouserc.js"],
    languageOptions: {
      globals: { module: "writable", require: "readonly" },
    },
  },
];
