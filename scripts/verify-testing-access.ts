import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { privateHttpsOrigin as origin } from "../src/lib/private-preview-origin";

// Owner-requested UI verification only. No application/provider mutations.
const output = process.argv[2];
if (!output?.startsWith("/tmp/opencode/"))
  throw new Error("Explicit private evidence directory required");
await mkdir(output, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const profile of [
    {
      name: "desktop-light",
      width: 1440,
      height: 1000,
      colorScheme: "light" as const,
    },
    {
      name: "mobile-dark",
      width: 390,
      height: 844,
      colorScheme: "dark" as const,
    },
  ]) {
    const context = await browser.newContext({
      viewport: profile,
      colorScheme: profile.colorScheme,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const writes: string[] = [],
      errors: string[] = [];
    await context.route("**/*", (route) => {
      const request = route.request();
      if (
        !["GET", "HEAD"].includes(request.method()) ||
        new URL(request.url()).origin !== origin
      ) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/dashboard");
    await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
    await expect(
      dialog.getByRole("button", { name: "Send to CareOS" }),
    ).toBeDisabled();
    await dialog
      .getByRole("link", { name: "Testing access", exact: true })
      .click();
    await expect(page).toHaveURL(origin + "/ai-evaluation");
    await expect(
      page.getByRole("heading", { name: "Testing access", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Testing session expired", { exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Authorize this browser|Connect selected scopes via SSH/,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Check access", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "No token refresh, renewal or model call was performed",
    );
    await page
      .getByRole("button", { name: "Prepare testing request", exact: true })
      .click();
    const request = page.getByRole("textbox", {
      name: "Testing access request (not a token)",
      exact: true,
    });
    await expect(request).toHaveValue(/proposal, not authorization/);
    await expect(request).toHaveValue(/Requested duration: 4 hours/);
    await page
      .getByRole("button", { name: "Copy request for OpenCode", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      await request.inputValue(),
    );
    await page
      .getByLabel("Requested duration", { exact: true })
      .selectOption("1");
    await expect(request).toHaveCount(0); // A prior proposal cannot silently survive edits.
    await page
      .getByRole("checkbox", { name: "CareOS planning for my Insights" })
      .uncheck();
    await page
      .getByRole("button", { name: "Prepare testing request", exact: true })
      .click();
    await expect(request).toHaveValue(/Requested duration: 1 hour from/);
    await expect(request).toHaveValue(
      /Requested scopes: customer \(my browser only/,
    );
    await page
      .getByRole("checkbox", { name: "Customer CareOS chat" })
      .uncheck();
    await expect(request).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Prepare testing request",
        exact: true,
      }),
    ).toBeDisabled();
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations;
    assert.deepEqual(
      violations.map((v) => v.id),
      [],
    );
    await page.screenshot({
      path: `${output}/${profile.name}-testing-access.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.route("**/api/ai/evaluation", (route) =>
      route.fulfill({ status: 503, json: { error: "isolated-status-outage" } }),
    );
    await page
      .getByRole("button", { name: "Check access", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Status unavailable");
    await expect(
      page.getByText("Testing access unavailable", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/ai/evaluation");
    await page
      .getByRole("button", { name: "Check access", exact: true })
      .click();
    await expect(
      page.getByText("Testing session expired", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to Home", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your care space, Alex.",
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      (await context.cookies()).filter((cookie) =>
        cookie.name.startsWith("palcare-"),
      ),
      [],
    );
    results.push({
      profile: profile.name,
      expiredExplanation: true,
      chatLink: true,
      prepareAndCopy: true,
      scopeDurationAndStaleDraftGuards: true,
      statusOutage: "injected GET-only",
      axe: "PASS",
      applicationWrites: 0,
      modelCalls: 0,
      grants: 0,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(results, null, 2));
