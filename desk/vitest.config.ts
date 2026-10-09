import { defineConfig } from "vitest/config";

// Unit tests cover the shared data and the server functions, so they run in plain Node.
// The browser tests in e2e/ are Playwright's, not Vitest's.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
