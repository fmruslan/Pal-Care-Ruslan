import { defineConfig, devices } from "@playwright/test";
import { assertWorkspace } from "./scripts/workspace.mjs";

assertWorkspace();

export default defineConfig({
  testDir: "./tests/access",
  outputDir: "test-results/access",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3114", trace: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
