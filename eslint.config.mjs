import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  { ignores: ["library/**", "node_modules/**", "**/node_modules/**"] },
  {
    files: ["skills/**/*.mjs", "scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: { "simple-import-sort": simpleImportSort, "unused-imports": unusedImports },
    rules: {
      "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
      "no-shadow": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
];
