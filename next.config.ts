import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["65.0.71.41"],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
