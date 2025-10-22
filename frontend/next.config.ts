import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // Needed for react-pdf to work properly with PDF.js worker
    config.resolve.alias.canvas = false;

    return config;
  },
};

export default nextConfig;
