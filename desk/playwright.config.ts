import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a second run (or a busy 8788) use another port; each port keeps its own local state.
const PORT = Number(process.env["E2E_PORT"] ?? 8788);
const CI = Boolean(process.env["CI"]);

// The browser tests run against the built site served by `wrangler pages dev`, so the Pages Functions
// are exercised too. MOCK=1 turns the live model off: no API key is needed and nothing is spent.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx wrangler pages dev dist --ip 127.0.0.1 --port ${PORT} --persist-to .wrangler/e2e-${PORT} --binding MOCK=1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
