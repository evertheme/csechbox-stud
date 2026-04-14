import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // Explicit tsconfig path ensures the DTS builder uses the local tsconfig
  // (with its include patterns) instead of creating an unnamed empty project,
  // which was the source of the TS6307 "not listed in file list" errors.
  tsconfig: "tsconfig.json",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: "dist",
});
