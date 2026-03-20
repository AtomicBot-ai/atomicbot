import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const reactJsxRuntime = reactPlugin.configs.flat["jsx-runtime"];
const reactHooksRecommended = reactHooks.configs["recommended-latest"];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "renderer/dist/**",
      "node_modules/**",
      "release/**",
      "vendor/**",
      "coverage/**",
      "**/*.cjs",
      ".gog-runtime/**",
      ".jq-runtime/**",
      ".memo-runtime/**",
      ".remindctl-runtime/**",
      ".obsidian-cli-runtime/**",
      ".gh-runtime/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}", "**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
    },
  },
  {
    files: ["renderer/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ...reactJsxRuntime.languageOptions?.parserOptions,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactJsxRuntime.rules,
      ...reactHooksRecommended.rules,
      "react/prop-types": "off",
    },
  },
  eslintConfigPrettier
);
