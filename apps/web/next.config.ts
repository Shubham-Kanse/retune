import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@retune/db", "@retune/auth", "@retune/agent", "@retune/billing"],
  serverExternalPackages: ["bcrypt", "bcryptjs", "postgres", "@electric-sql/pglite", "@temporalio/client", "@temporalio/worker", "@temporalio/workflow", "@temporalio/activity"],
  outputFileTracingIncludes: {
    "/api/generate/[id]/stream": ["../../packages/agent/assets/**"],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    formats: ["image/webp", "image/avif"],
  },
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
