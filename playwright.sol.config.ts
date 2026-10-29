import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { solTestScope } from "./tests/helpers/sol-scopes";

// Independent fixture identities, not deleted quotas or increased rate limits.
// Propagated to server/worker processes; never read by the private app launcher.
const run = (process.env.PALCARE_SOL_TEST_RUN ??=
  randomBytes(32).toString("hex"));
export default defineConfig({
  testDir: "./tests/sol",
  outputDir: "test-results/sol",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-light",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        baseURL: solTestScope("desktop-light", run).origin,
      },
    },
    {
      name: "mobile-dark",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        colorScheme: "dark",
        baseURL: solTestScope("mobile-dark", run).origin,
      },
    },
  ],
  webServer: ["desktop-light", "mobile-dark"].map((project) => ({
    command: `pnpm exec tsx scripts/start-sol-test-server.ts ${new URL(solTestScope(project, run).origin).port}`,
    url: `${solTestScope(project, run).origin}/api/health`,
    env: { PALCARE_SOL_TEST_RUN: run },
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10000 },
  })),
});
