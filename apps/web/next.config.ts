import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-native", "react-native-web", "@poker/ui"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "react-native$": "react-native-web",
    };
    config.resolve.extensions = [
      ".web.js",
      ".web.jsx",
      ".web.ts",
      ".web.tsx",
      ...(config.resolve.extensions ?? []),
    ];
    return config;
  },
};

export default nextConfig;
