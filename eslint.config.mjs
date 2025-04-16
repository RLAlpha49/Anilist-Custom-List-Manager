import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintPluginPrettierRecommended from "eslint-config-prettier";
import reactCompiler from "eslint-plugin-react-compiler";
import nextPlugin from "@next/eslint-plugin-next";
import path from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prettierIgnorePath = path.resolve(__dirname, ".prettierignore");

/** @type {import('eslint').Linter.Config[]} */
export default [
  includeIgnoreFile(prettierIgnorePath),
  // Ignore patterns
  {
    ignores: [
      // Build output
      "out/**",

      // Node modules
      "node_modules/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "react-compiler": reactCompiler,
      "@next/next": nextPlugin,
    },
    rules: {
      "react-compiler/react-compiler": "error",
      ...nextPlugin.configs.recommended.rules,
    },
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    settings: {
      react: {
        version: "detect",
      },
      next: {
        rootDir: ".",
      },
    },
  },
  eslintPluginPrettierRecommended,
  ...tseslint.configs.recommended,
];
