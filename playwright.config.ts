import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { assertWorkspace } from "./scripts/workspace.mjs";

assertWorkspace();

config({ path: ".env.local", quiet: true });
const dataSource = process.env.E2E_DATA_SOURCE ?? "fixtures";
if (!["fixtures", "database"].includes(dataSource))
  throw new Error("E2E_DATA_SOURCE must be fixtures or database.");
const testDatabase = process.env.TEST_DATABASE_URL;
if (
  dataSource === "database" &&
  (!testDatabase ||
    !URL.canParse(testDatabase) ||
    !["localhost", "127.0.0.1"].includes(new URL(testDatabase).hostname) ||
    !new URL(testDatabase).pathname.endsWith("_test"))
)
  throw new Error(
    "Database browser tests require an explicit local dedicated TEST_DATABASE_URL ending _test.",
  );

const port = Number(process.env.E2E_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("E2E_PORT must be an unprivileged TCP port.");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `test-results/${dataSource}`,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: `playwright-report/${dataSource}` },
    ],
  ],
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
    command: `pnpm exec tsx scripts/start-test-server.ts ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    // Allow the test-server wrapper to revoke/drop its disposable logins.
    // Playwright's default force-kill bypasses asynchronous cleanup.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: {
      DEMO_DATA_SOURCE: dataSource,
      DATABASE_URL: dataSource === "database" ? testDatabase! : "",
      CAREOS_DATABASE_URL: dataSource === "database" ? testDatabase! : "",
      GUARDIAN_DATABASE_URL: dataSource === "database" ? testDatabase! : "",
      CAREOS_API_KEY: "",
      PAYPAL_CHECKOUT_ENABLED: "false",
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      CAREOS_PROVIDER: "fixture",
      CAREOS_LIVE_ENABLED: "false",
      GUARDIAN_OPERATIONS_ENABLED: dataSource === "database" ? "true" : "false",
      GUARDIAN_REFUNDS_ENABLED: "false",
      GUARDIAN_PROVIDER_READS_ENABLED: "false",
      PRICE_GUARDIAN_CHECKOUT_ENABLED: "false",
      DISCOVERY_PROVIDER: "fixture",
      CHANNEL3_LIVE_ENABLED: "false",
      CHANNEL3_FREE_CREDITS_CONFIRMED: "false",
      CHANNEL3_API_KEY: "",
      DISCOVERY_DATABASE_URL: "",
      AG_STUDIO_LOCAL_EVALUATION_ENABLED: "true",
    },
  },
});
