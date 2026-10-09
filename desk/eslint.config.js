import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".wrangler", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["functions/**/*.ts", "shared/**/*.ts", "tests/**/*.ts", "e2e/**/*.ts", "scripts/**/*.ts", "*.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // Plain JS config files are not part of any tsconfig.
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
