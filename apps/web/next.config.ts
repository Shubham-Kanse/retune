import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@retune/db", "@retune/auth", "@retune/agent", "@retune/billing"],
  serverExternalPackages: ["bcrypt", "bcryptjs", "postgres", "@electric-sql/pglite"],
  outputFileTracingIncludes: {
    // Bundle the ontology JSON assets with every API route that runs the pipeline.
    // Required for `standalone` output and any containerised deployment.
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
  output: "standalone",
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
