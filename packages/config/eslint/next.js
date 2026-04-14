import { FlatCompat } from "@eslint/eslintrc";
import baseConfig from "./base.js";

const compat = new FlatCompat();

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  ...compat.extends("next/core-web-vitals"),
];
