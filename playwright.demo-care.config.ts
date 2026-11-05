import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

const server = base.webServer;
if (!server || Array.isArray(server))
  throw Error("Single test web server required");
export default defineConfig({
  ...base,
  testMatch: "care-ten-products.spec.ts",
  testIgnore: [],
  outputDir: "test-results/demo-care",
  projects: base.projects!.filter((p) => /^(desktop|mobile)-/.test(p.name!)),
  webServer: {
    ...server,
    env: {
      ...server.env,
      DEMO_DATA_SOURCE: "fixtures",
      CARE_DEMO_ENABLED: "true",
    },
  },
});
