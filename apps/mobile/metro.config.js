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

// Use package.json "exports" field to resolve web-specific code paths.
config.resolver.unstable_enablePackageExports = true;

// On web, stub out the worklets-core runtime entirely.  It uses import.meta.url
// to spin up a Worker, which is a native-only concept with no web equivalent.
// Returning { type: "empty" } makes Metro emit an empty module so nothing
// downstream breaks at parse time.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-worklets-core") {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Extend the default transformIgnorePatterns to also Babel-transform packages
// that ship ESM code containing import.meta (supabase, socket.io-client, …).
// The default pattern from @expo/metro-config already allows react-native/*,
// expo/*, etc.; we append our extra packages to the same "do NOT ignore" group.
const [defaultPattern, ...rest] = config.transformer.transformIgnorePatterns ?? [];
if (defaultPattern) {
  const src =
    typeof defaultPattern === "string" ? defaultPattern : defaultPattern.source;
  // The Expo default looks like: node_modules/(?!(pkg-a|pkg-b|…)…)
  // We splice our additions right after the opening (?!(
  const extended = src.replace(
    "node_modules/(?!(",
    "node_modules/(?!(@supabase|socket\\.io-client|engine\\.io-client|react-native-worklets-core|"
  );
  config.transformer.transformIgnorePatterns = [new RegExp(extended), ...rest];
}

module.exports = config;
