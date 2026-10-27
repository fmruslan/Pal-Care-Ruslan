import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/sol",
  outputDir: "test-results/sol",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3112", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-light",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "mobile-dark",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: "pnpm exec tsx scripts/start-sol-test-server.ts 3112",
    url: "http://127.0.0.1:3112/api/health",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
  },
});
