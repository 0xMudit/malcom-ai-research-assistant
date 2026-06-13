import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["65.0.71.41"],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
