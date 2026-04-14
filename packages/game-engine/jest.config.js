/** @type {import("jest").Config} */
export default {
  // ── Transform ───────────────────────────────────────────────────────────────
  //
  // ts-jest/presets/default-esm sets up the TypeScript transform with
  // useESM: true, matching the ESM output tsup produces.
  preset: "ts-jest/presets/default-esm",

  // ── Environment ─────────────────────────────────────────────────────────────
  testEnvironment: "node",
  rootDir: ".",

  // Required for native Node ESM: tell Jest which extensions are ES modules.
  extensionsToTreatAsEsm: [".ts"],

  // ── Module resolution ────────────────────────────────────────────────────────
  //
  // TypeScript source files import with ".js" extensions (e.g. "./card.js") so
  // that the compiled output resolves correctly.  This mapper strips the ".js"
  // suffix during test runs so Jest resolves the ".ts" source instead.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // ── Test discovery ───────────────────────────────────────────────────────────
  testMatch: [
    "**/__tests__/**/*.ts",
    "**/*.test.ts",
    "**/*.spec.ts",
  ],

  // ── Coverage ─────────────────────────────────────────────────────────────────
  collectCoverageFrom: [
    "src/**/*.ts",
    // Exclude generated declaration files
    "!src/**/*.d.ts",
    // Exclude test files themselves
    "!src/**/__tests__/**",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
  ],

  coverageReporters: [
    "text",        // printed to the terminal
    "lcov",        // consumed by CI coverage tools
    "html",        // browseable report in coverage/
  ],

  // All four metrics must reach 80 % globally or the test run fails.
  coverageThreshold: {
    global: {
      branches:   80,
      functions:  80,
      lines:      80,
      statements: 80,
    },
  },
};
