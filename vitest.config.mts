import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    exclude: ["test/e2e/**", "node_modules/**"],
  },
});
