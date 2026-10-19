import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: BASE_URL,
    // Same-origin header so API tests pass the CSRF origin check like a browser
    extraHTTPHeaders: { Origin: BASE_URL },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Optional: reuse a locally installed Chromium (PW_CHROMIUM_PATH)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `http://localhost:${PORT}/api/live`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
