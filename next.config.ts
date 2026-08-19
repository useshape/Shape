import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isProd = process.env.NODE_ENV === "production";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: isProd ? "export" : undefined,
  // Use root-absolute asset URLs so secondary windows (/settings/, /git/, etc.)
  // load CSS/JS from /_next/... instead of broken nested /_next/... paths.
  trailingSlash: isProd ? true : undefined,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@tauri-apps/api"],
  },
};

export default nextConfig;
