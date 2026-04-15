/** @type {import("jest").Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  rootDir: ".",
  extensionsToTreatAsEsm: [".ts"],

  moduleNameMapper: {
    "^@poker/shared-types$":
      "<rootDir>/node_modules/@poker/shared-types/dist/index.js",
    "^@poker/game-engine$":
      "<rootDir>/node_modules/@poker/game-engine/dist/index.js",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  testMatch: ["**/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],

  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.ts",
  ],
};
