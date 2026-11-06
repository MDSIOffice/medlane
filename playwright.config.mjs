// Browser smoke tests: the real app in a real browser against tests/smoke/fake-backend.mjs.
// Locally this uses your installed Chrome; CI installs Playwright's Chromium.
import { defineConfig } from "@playwright/test";

const PORT = 8799;
export default defineConfig({
  testDir: "tests/smoke",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  timeout: 90_000,
  outputDir: "node_modules/.cache/playwright-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node tests/smoke/fake-backend.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
  },
});
