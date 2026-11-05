// Actual Next/DOM + real isolated PostgreSQL evidence; North transport is injected.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { testRuntimeRoles } from "./runtime-roles";
import { isolatedCareEnvironment } from "./isolated-care-environment";
import { careStatusAnswer } from "../../src/lib/care/answer";
import type { CareFeed } from "../../src/lib/care/model";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";

export async function protectionBrowserJourney(
  databaseUrl: string,
  protectionReaderUrl: string,
  feed: CareFeed,
  twinId: string,
) {
  const roles = await testRuntimeRoles(databaseUrl);
  const port = 3124,
    origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
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
        CARE_PROTECTION_ENABLED: "true",
        CARE_PROTECTION_SCHEDULE_ENABLED: "true",
        CARE_PROTECTION_READER_DATABASE_URL: protectionReaderUrl,
        APP_ORIGIN: origin,
        CAREOS_PROVIDER: "fixture",
        CAREOS_LIVE_ENABLED: "false",
        CAREOS_API_KEY: "",
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
  // Drain output without persisting environments/credentials or failing on normal logs.
  child.stdout?.resume();
  child.stderr?.resume();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const deadline = Date.now() + 20000;
    while (true) {
      if (child.exitCode !== null)
        throw Error("isolated_protection_browser_server_stopped");
      try {
        const result = await fetch(origin + "/api/ready");
        if (result.ok) break;
      } catch {}
      if (Date.now() > deadline)
        throw Error("isolated_protection_browser_readiness_failed");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch();
    await mkdir("test-results/protection-journey", { recursive: true });
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
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (
          request.method() === "POST" &&
          !/^\/api\/careos\/records\/conversations(?:\/[^/]+\/turns)?$/.test(
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
      const main = page.getByRole("main"),
        card = main.locator(`[data-care-product="${twinId}"]`);
      await expect(card).toBeVisible();
      await expect(main.locator("[data-care-product]")).toHaveCount(5);
      expect(
        await main
          .locator("[data-care-product]")
          .first()
          .getAttribute("data-care-product"),
      ).toBe(twinId);
      await expect(
        page
          .getByRole("navigation", { name: "Care filters", exact: true })
          .getByRole("link"),
      ).toHaveText([
        "All purchases (5)",
        "Needs attention",
        "Watching",
        "Completed",
      ]);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await expect(card.locator("[data-ownership-pill]")).toContainText(
        "Possible adjustment available",
      );
      await expect(card).toContainText(
        "$20.00 potential adjustment, not savings",
      );
      await expect(
        main.getByRole("region", {
          name: "Protection notifications",
          exact: true,
        }),
      ).toContainText("Possible adjustment");
      await expect(
        page.getByRole("link", { name: "Compare prices", exact: true }),
      ).toHaveCount(0);
      const scope = main.locator(
          `[data-ownership-surface="care"][data-ownership-twin="${twinId}"]`,
        ),
        revision = (await scope.getAttribute("data-ownership-revision"))!;
      await page.route(
        "**/api/careos/records/conversations/*/turns",
        async (route) => {
          turns++;
          const input = route.request().postDataJSON();
          const answer = careStatusAnswer(
            feed,
            input.revision,
            [twinId],
            "open_price",
          );
          answer.careHighlights![0].revision = revision;
          const {
            version: _v,
            referenceDate: _r,
            timezone: _t,
            ...query
          } = emptyRecordsQuery(new Date().toISOString().slice(0, 10));
          void _v;
          void _r;
          void _t;
          answer.conversationPlan = {
            task: "aftercare",
            relation: "selected",
            query: { ...query, outcome: "query" },
            comparison: null,
            productSearch: "",
            productAction: "open_price",
            careQuestion: "",
            clarification: "",
          };
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
        .fill("Show all my purchases and their price protection next steps");
      await page
        .getByRole("button", { name: "Ask North Star", exact: true })
        .click();
      const north = page.getByRole("dialog", {
        name: "North Star",
        exact: true,
      });
      await expect(north).toContainText(
        "Visible cards, supporting facts and evidence revisions were checked",
      );
      await expect(scope.locator("[data-care-focus-evidence]")).toContainText(
        "Actual supported checks changed from $129.00",
      );
      await scope
        .getByRole("button", {
          name: "Review evidence & available actions",
          exact: true,
        })
        .click();
      const panel = page.getByRole("dialog", {
        name: "Price protection",
        exact: true,
      });
      await expect(panel).toHaveAttribute("data-ownership-twin", twinId);
      await panel
        .getByRole("button", {
          name: "Prepare price adjustment message",
          exact: true,
        })
        .click();
      const draft = panel.getByRole("textbox", {
        name: "Editable price adjustment enquiry · not sent",
        exact: true,
      });
      await expect(draft).toHaveValue(/\$129\.00/);
      await expect(draft).toHaveValue(/\$109\.00/);
      await expect(draft).toHaveValue(/\$20\.00/);
      await expect(draft).toHaveValue(/Exclusive deadline/);
      expect(await draft.inputValue()).toContain(
        feed.protections.find((p) => p.twinId === twinId)!.deadline!,
      );
      await expect(draft).toHaveValue(/Please confirm the applicable policy/);
      await draft.fill(
        (await draft.inputValue()) +
          "\nCustomer review: fictional enquiry only.",
      );
      await expect(draft).toHaveValue(
        /Customer review: fictional enquiry only/,
      );
      await page.screenshot({
        path: `test-results/protection-journey/${profile}.png`,
        fullPage: true,
      });
      await panel
        .getByRole("button", { name: "Discard draft", exact: true })
        .click();
      await expect(draft).toHaveCount(0);
      await page.keyboard.press("Escape");
      expect(turns).toBe(1);
      expect(forbidden).toEqual([]);
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
