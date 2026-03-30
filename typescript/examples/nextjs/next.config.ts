import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: dirname,
  },
};

export default nextConfig;
