import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Turbopack configuration (required in Next.js 16+)
  turbopack: {
    resolveAlias: {
      // Disable canvas module for react-pdf compatibility
      canvas: "./empty-module.js",
    },
  },
  // Webpack configuration (kept for webpack-only builds)
  webpack: (config) => {
    // Needed for react-pdf to work properly with PDF.js worker
    config.resolve.alias.canvas = false;

    return config;
  },
};

export default nextConfig;
