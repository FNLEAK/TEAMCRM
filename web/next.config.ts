import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Monorepo: trace files from repo root (quiets wrong-root warning when multiple lockfiles exist). */
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  webpack: (config, { dev }) => {
    /** Set NEXT_DISABLE_WEBPACK_CACHE=1 if builds fail with ENOSPC (disk full). */
    if (!dev && process.env.NEXT_DISABLE_WEBPACK_CACHE === "1") {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
