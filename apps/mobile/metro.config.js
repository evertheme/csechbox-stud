const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files within the monorepo so Metro can resolve workspace packages.
config.watchFolders = [monorepoRoot];

// Tell Metro where to look for modules — project-local first, then monorepo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Use package.json "exports" field to resolve web-specific code paths,
// preventing native-only modules (e.g. worklets) from leaking import.meta into web bundles.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
