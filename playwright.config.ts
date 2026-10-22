import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("E2E_PORT must be an unprivileged TCP port.");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  snapshotPathTemplate: "{testDir}/visual/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    },
  },
  projects: (["light", "dark"] as const).flatMap((colorScheme) => [
    {
      name: `desktop-${colorScheme}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        colorScheme,
      },
    },
    {
      name: `tablet-${colorScheme}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 834, height: 1112 },
        hasTouch: true,
        colorScheme,
      },
    },
    {
      name: `mobile-${colorScheme}`,
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium" as const,
        colorScheme,
      },
    },
  ]),
  webServer: {
    command: `pnpm start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    env: {
      DEMO_DATA_SOURCE: process.env.E2E_DATA_SOURCE ?? "fixtures",
      PAYPAL_CHECKOUT_ENABLED: "false",
      APP_ORIGIN: `http://127.0.0.1:${port}`,
    },
  },
});
