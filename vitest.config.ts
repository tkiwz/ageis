import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.ts", "tests/unit/**/*.{test,spec}.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**", "playwright-report"],
    coverage: {
      reporter: ["text", "html"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        ".next/**",
        "node_modules/**",
        "prisma/**",
      ],
    },
  },
});
