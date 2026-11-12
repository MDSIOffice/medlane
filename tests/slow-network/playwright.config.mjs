// Slow-network browser tests against the local copy of the system (start it with `npm run local`).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  workers: 1, // one browser at a time so throttled timings aren't skewed by CPU contention
  reporter: "list",
  outputDir: "../../node_modules/.cache/playwright-slow-network",
  use: {
    baseURL: process.env.LOCAL_URL || "http://127.0.0.1:8787",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    actionTimeout: 120_000,
    navigationTimeout: 300_000,
  },
});
