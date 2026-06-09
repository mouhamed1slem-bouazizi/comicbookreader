import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
    unoptimized: true,
  },
  serverExternalPackages: ["firebase-admin", "googleapis", "node-unrar-js", "terabox-api"],
};

export default nextConfig;
