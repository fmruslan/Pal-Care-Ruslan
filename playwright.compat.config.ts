import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  // Includes axe, screenshots and several real SDK tool runs on slower Linux WebKit.
  // Individual assertions retain their normal deadlines; this is not retry masking.
  timeout: 60_000,
  testMatch:
    /(?:stage5-journey|intelligence|customer-insights|customer-reflow|careos-interaction|careos-purchase-choice|careos-accessibility)\.spec\.ts/,
  outputDir: "test-results/compatibility",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report/compatibility" },
    ],
  ],
  projects: [
    {
      name: "firefox-desktop",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 1000 },
        colorScheme: "light",
      },
    },
    {
      name: "webkit-emulated-mobile",
      use: { ...devices["iPhone 13"], colorScheme: "dark" },
    },
  ],
});
