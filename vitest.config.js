import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/**/*.test.js", "src/__fixtures__/**"],
      reporter: ["text"],
      thresholds: {
        lines: 99,
        functions: 100,
        branches: 78,
        statements: 99,
      },
    },
  },
});
