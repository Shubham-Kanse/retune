import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@retune/db", "@retune/auth", "@retune/agent", "@retune/billing"],
  // Keep worker/workflow Temporal packages out of web runtime boundary.
  serverExternalPackages: ["bcrypt", "bcryptjs", "postgres", "@electric-sql/pglite", "pdf-parse", "pdfjs-dist", "mammoth", "@temporalio/worker", "@temporalio/workflow", "webpack", "@swc/core"],
  outputFileTracingIncludes: {
    "/api/generate/[id]/stream": ["../../packages/agent/assets/**"],
    "/api/onboarding-v2/upload": [
      "../../node_modules/.pnpm/pdf-parse*/node_modules/pdf-parse/**",
      "../../node_modules/.pnpm/pdfjs-dist*/node_modules/pdfjs-dist/**",
      "../../node_modules/.pnpm/mammoth*/node_modules/mammoth/**",
    ],
    "/api/profile/import-resume": [
      "../../node_modules/.pnpm/pdf-parse*/node_modules/pdf-parse/**",
      "../../node_modules/.pnpm/pdfjs-dist*/node_modules/pdfjs-dist/**",
      "../../node_modules/.pnpm/mammoth*/node_modules/mammoth/**",
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "motion",
      "sonner",
    ],
    // Enable parallel route compilation
    webpackBuildWorker: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    formats: ["image/webp", "image/avif"],
  },
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
};

export default nextConfig;
