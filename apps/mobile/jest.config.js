/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",

  // pnpm stores packages under node_modules/.pnpm/<pkg>/node_modules/<pkg>.
  // Without excluding ".pnpm" the regex matches the outer node_modules first
  // (at .pnpm) and never reaches the inner @react-native / expo segments,
  // causing Flow-syntax files to skip Babel transformation.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))",
    "/node_modules/react-native-reanimated/plugin/",
  ],

  setupFiles: ["./jest.setup.ts"],

  testMatch: [
    "**/__tests__/**/*.test.{ts,tsx}",
    "**/*.test.{ts,tsx}",
  ],

  moduleNameMapper: {
    // Silence static asset imports that aren't relevant for logic tests.
    "\\.(png|jpg|jpeg|gif|svg|webp)$": "<rootDir>/__mocks__/fileMock.js",
  },

  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "context/**/*.{ts,tsx}",
    "app/(auth)/**/*.{ts,tsx}",
    "app/(app)/**/*.{ts,tsx}",
    "!**/_layout.tsx",
  ],

  coverageReporters: ["text", "lcov", "html"],
};
