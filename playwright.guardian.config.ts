import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./tests/guardian-e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results/guardian-flow",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report/guardian-flow" },
    ],
  ],
});
