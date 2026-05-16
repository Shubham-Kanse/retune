import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [".next/**", "node_modules/**", "dist/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@retune/db/application-status": resolve(
        __dirname,
        "../../packages/db/src/application-status.ts",
      ),
      "@retune/db/compute-completeness": resolve(
        __dirname,
        "../../packages/db/src/compute-completeness.ts",
      ),
    },
  },
});
