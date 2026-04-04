import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /** Tree-shake heavy barrel packages (smaller client bundles, faster parse on mobile). */
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-virtual",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@fullcalendar/react",
      "@fullcalendar/core",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/interaction",
      "date-fns",
    ],
  },
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
