// Real dedicated PostgreSQL -> restricted Next runtime -> DOM. North transport
// is injected; no live model, PayPal, application database or private authority.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { DemoData } from "../../src/db/schema";
import type { CareFeed } from "../../src/lib/care/model";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { testRuntimeRoles } from "./runtime-roles";
import { isolatedCareEnvironment } from "./isolated-care-environment";

export async function demoCareBrowserJourney(
  databaseUrl: string,
  readerUrl: string,
  data: DemoData,
  feed: CareFeed,
) {
  const roles = await testRuntimeRoles(databaseUrl);
  const origin = "http://127.0.0.1:3125";
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3125",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        ...isolatedCareEnvironment,
        DEMO_DATA_SOURCE: "database",
        DATABASE_URL: roles.urls.reader,
        CAREOS_DATABASE_URL: roles.urls.careos,
        CARE_DEMO_ENABLED: "true",
        CARE_CONSUMER_SCENARIOS_ENABLED: data.consumerDemo ? "true" : "false",
        CARE_DEMO_READER_DATABASE_URL: readerUrl,
        APP_ORIGIN: origin,
        CAREOS_PROVIDER: "fixture",
        CAREOS_LIVE_ENABLED: "false",
        CAREOS_OWNER_MODE: "false",
        CAREOS_STANDING_AI_ENABLED: "false",
        PAYPAL_CHECKOUT_ENABLED: "false",
        GUARDIAN_OPERATIONS_ENABLED: "false",
        GUARDIAN_REFUNDS_ENABLED: "false",
        GUARDIAN_PROVIDER_READS_ENABLED: "false",
        PRICE_GUARDIAN_CHECKOUT_ENABLED: "false",
        DISCOVERY_PROVIDER: "fixture",
        CHANNEL3_LIVE_ENABLED: "false",
        AG_STUDIO_LOCAL_EVALUATION_ENABLED: "true",
      },
    },
  );
  child.stdout?.resume();
  child.stderr?.resume();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const deadline = Date.now() + 20000;
    while (true) {
      if (child.exitCode !== null) throw Error("demo_browser_server_stopped");
      try {
        if ((await fetch(origin + "/api/ready")).ok) break;
      } catch {}
      if (Date.now() > deadline) throw Error("demo_browser_readiness_failed");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch();
    await mkdir("test-results/demo-care-database", { recursive: true });
    for (const [profile, width, colorScheme] of [
      ["desktop-light", 1440, "light"],
      ["mobile-dark", 390, "dark"],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const forbidden: string[] = [];
      let turns = 0;
      page.on("request", (r) => {
        const path = new URL(r.url()).pathname;
        if (
          r.method() === "POST" &&
          !/^\/api\/careos\/(?:records\/)?conversations(?:\/[^/]+\/turns)?$/.test(
            path,
          )
        )
          forbidden.push(path);
      });
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await page.goto(origin + "/dashboard");
      await expect(
        page.locator('[data-care-calendar-engine="verified"]'),
      ).toBeVisible({ timeout: 20000 });
      const main = page.getByRole("main");
      await expect(main.locator("[data-care-product]")).toHaveCount(10);
      const headphones = main.locator(
        '[data-care-product="00000000-0000-4000-8000-000000000201"]',
      );
      await headphones
        .locator("summary")
        .filter({ hasText: "2 purchases · receipts & history" })
        .click();
      const members = data.twins.filter(
        (t) => t.productId === "00000000-0000-4000-8000-000000000101",
      );
      expect(members).toHaveLength(2);
      for (const twin of members)
        await expect(
          headphones.locator(`details a[href="/vault/${twin.id}"]`),
        ).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.goto(origin + "/vault/00000000-0000-4000-8000-000000000205");
      const prices = page.getByRole("region", {
        name: "Purchase and retail reference prices",
        exact: true,
      });
      await expect(prices).toContainText("$1,199.00");
      await expect(prices).toContainText("$1,099.00");
      await expect(prices).toContainText("direct page unavailable");
      const receipt = data.documents.find(
        (d) =>
          d.twinId === "00000000-0000-4000-8000-000000000205" &&
          d.kind === "receipt",
      )!;
      await page.goto(origin + `/documents/${receipt.id}`);
      await expect(main).toContainText("SAMPLE DATA ONLY");
      await expect(main).toContainText("1199.00");
      await page.goto(origin + "/dashboard");
      await page.route(
        /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/turns$/,
        async (route) => {
          turns++;
          const input = route.request().postDataJSON();
          const answer = careStatusAnswer(
            feed,
            input.revision,
            turns === 1
              ? ["00000000-0000-4000-8000-000000000205"]
              : feed.purchases.map((p) => p.id),
            turns === 1 ? "retail-reference" : "upcoming-care",
          );
          await route.fulfill({
            json: {
              requestId: input.requestId,
              message: input.message,
              answer,
            },
          });
        },
      );
      await page
        .getByRole("searchbox", {
          name: "Search products and documents",
          exact: true,
        })
        .fill("What is my refrigerator's retail reference price?");
      await page
        .getByRole("button", { name: "Ask North Star", exact: true })
        .click();
      const north = page.getByRole("dialog", {
        name: "North Star",
        exact: true,
      });
      await expect(north).toContainText("$1,099.00");
      await expect(north).toContainText("$1,199.00");
      await expect(north).toContainText("not live prices");
      await north
        .getByRole("button", { name: "Close North Star", exact: true })
        .click();
      await page
        .getByRole("searchbox", {
          name: "Search products and documents",
          exact: true,
        })
        .fill("What's coming up in my next 30 days?");
      await page
        .getByRole("button", { name: "Ask North Star", exact: true })
        .click();
      await expect(north).toContainText("Your next 30 days");
      await expect(north).toContainText("0 verified Sandbox");
      const request = await north
        .locator("[data-request-id]")
        .last()
        .getAttribute("data-request-id");
      expect(request).toBeTruthy();
      for (const destination of ["Purchases", "Insights", "Care"]) {
        await page
          .getByRole("navigation", { name: "Main navigation", exact: true })
          .getByRole("link", { name: destination, exact: true })
          .click();
        await expect(north).toHaveCount(0);
        await page
          .getByRole("button", { name: "History", exact: true })
          .click();
        await expect(
          north.locator(`[data-request-id="${request}"]`),
        ).toBeVisible();
        await expect(north).toContainText("Your next 30 days");
        await expect(
          north.getByRole("region", {
            name: "Receipt and document preview",
            exact: true,
          }),
        ).toHaveCount(0);
        await north
          .getByRole("region", { name: "Previous North results", exact: true })
          .getByRole("button", {
            name: "What is my refrigerator's retail reference price?",
            exact: true,
          })
          .click();
        await expect(north).toContainText("$1,099.00");
        await north
          .getByRole("button", { name: "History", exact: true })
          .click();
        await north
          .getByRole("region", { name: "Previous North results", exact: true })
          .getByRole("button", {
            name: "What's coming up in my next 30 days?",
            exact: true,
          })
          .click();
        await expect(north).toContainText("Your next 30 days");
        await north
          .getByRole("button", { name: "Close North Star", exact: true })
          .click();
      }
      expect(turns).toBe(2);
      expect(forbidden).toEqual([]);
      await page.screenshot({
        path: `test-results/demo-care-database/${profile}.png`,
        fullPage: true,
      });
      await context.close();
    }
  } finally {
    await browser?.close();
    child.kill("SIGTERM");
    if (child.exitCode === null)
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await roles.close();
  }
}
