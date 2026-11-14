export default [
  { ignores: ["library/**", "node_modules/**", "**/node_modules/**"] },
  {
    files: ["skills/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
      "no-shadow": "error",
    },
  },
];
