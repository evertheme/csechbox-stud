module.exports = function (api) {
  // api.caller() implicitly keys the Babel cache on caller info (including
  // platform), so api.cache(true) must NOT also be called — they conflict.
  // react-native-worklets/plugin injects import.meta references that are
  // incompatible with Metro's non-module web bundle output.  Worklets are
  // a native-only concept, so skip the plugin entirely on web.
  const isWeb = api.caller((caller) => caller?.platform === "web");
  return {
    presets: ["babel-preset-expo"],
    plugins: isWeb ? [] : ["react-native-worklets/plugin"],
  };
};
