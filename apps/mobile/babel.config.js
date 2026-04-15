// Replaces every `import.meta` expression with `{}` so that packages which
// ship ESM (supabase, socket.io-client, worklets runtime, …) don't crash when
// Metro bundles them as a classic (non-module) script for web.
// `import.meta.url`  → `({}).url`  → undefined  (safe no-op)
// `import.meta.env`  → `({}).env`  → undefined  (safe no-op)
const replaceImportMeta = ({ types: t }) => ({
  name: "replace-import-meta",
  visitor: {
    MetaProperty(path) {
      if (
        t.isIdentifier(path.node.meta, { name: "import" }) &&
        t.isIdentifier(path.node.property, { name: "meta" })
      ) {
        path.replaceWith(t.objectExpression([]));
      }
    },
  },
});

module.exports = function (api) {
  // api.caller() implicitly keys the Babel cache on caller info (including
  // platform), so api.cache(true) must NOT also be called — they conflict.
  const isWeb = api.caller((caller) => caller?.platform === "web");
  return {
    presets: ["babel-preset-expo"],
    plugins: isWeb
      ? [replaceImportMeta]
      : ["react-native-worklets/plugin"],
  };
};
