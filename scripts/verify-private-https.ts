import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { privateHttpsOrigin as origin } from "../src/lib/private-preview-origin";

// Explicit owner-requested, no-model/no-financial verification of the actual
// private HTTPS site. Disposable browser storage only; no application writes.
const output = process.argv[2];
if (!output?.startsWith("/tmp/opencode/"))
  throw new Error("Explicit private evidence directory required");
await mkdir(output, { recursive: true, mode: 0o700 });
const ready = await fetch(origin + "/api/ready");
assert.equal(ready.status, 200);
const health = await ready.json();
assert.equal(health.aiAuthorization, "expired"); // Stop if the real window differs.
assert.deepEqual(health.features, {
  careos: "subscription",
  checkout: "disabled",
  guardian: "disabled",
  discovery: "fixture",
});

const status = await fetch(origin + "/api/ai/evaluation");
const access = await status.json();
assert.equal(access.window, "expired");
assert.deepEqual(access.scopes, { customer: false, studio: false });
assert.equal(status.headers.get("set-cookie"), null);
assert.match(status.headers.get("cache-control") ?? "", /private, no-store/);
const probes: { path: string; origin: string; status: number }[] = [];
for (const [path, body] of [
  ["/api/ai/evaluation", { scope: "customer", token: "a".repeat(64) }],
  [
    "/api/ai/owner-access",
    { action: "request", scopes: ["customer", "studio"] },
  ],
  ["/api/careos/conversations", {}],
  ["/api/intelligence/customer/plan", { action: "start" }],
] as const) {
  for (const requestOrigin of [
    origin,
    "https://evil.example",
    "http://127.0.0.1:3002",
  ]) {
    const response = await fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        "X-Forwarded-Host": new URL(origin).host,
        "X-Forwarded-Proto": "https",
        "Tailscale-User-Login": "untrusted-probe@example.invalid",
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 403, `${path} must remain denied`);
    assert.equal(response.headers.get("set-cookie"), null);
    probes.push({ path, origin: requestOrigin, status: response.status });
  }
}
assert.equal((await fetch(origin + "/api/ai/owner-access")).status, 403);
// Forwarded headers must not override an unapproved request Host. Loopback is
// an operational backend, not a second Studio browsing origin in this mode.
for (const host of [
  "evil.example",
  "127.0.0.1:3002",
  "greatbison.tail9e8802.ts.net:8443",
]) {
  const response = await fetch("http://127.0.0.1:3002/insights", {
    headers: {
      Host: host,
      "X-Forwarded-Host": new URL(origin).host,
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await response.text()).includes('id="purchase-workspace"'),
    false,
  );
}

function widget(page: Page, title: string) {
  return page
    .getByTestId("customer-studio")
    .locator(".ag-studio-layout-widget")
    .filter({
      has: page
        .locator(".ag-studio-layout-widget-title")
        .filter({ hasText: new RegExp(`^${title}$`) }),
    });
}
function sources(page: Page) {
  return page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: /^Source records & accessible summary/ }),
  });
}
async function records(page: Page) {
  return sources(page)
    .locator("article[data-purchase-id]")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute("data-purchase-id"),
        audio:
          n.querySelector("p")?.textContent?.includes(" · Audio · ") ?? false,
        sandbox: n.textContent?.includes("Verified Sandbox purchase") ?? false,
        receipt:
          [...n.querySelectorAll("a")]
            .find((a) => a.textContent?.startsWith("Open receipt"))
            ?.getAttribute("href") ?? null,
      })),
    );
}
async function selected(
  page: Page,
  expected: Awaited<ReturnType<typeof records>>,
) {
  await expect
    .poll(async () => (await records(page)).map((r) => r.id).sort())
    .toEqual(expected.map((r) => r.id).sort());
  await expect(page.getByLabel("Personal Insights filter scope")).toContainText(
    `${expected.length} purchases in the current Studio selection`,
  );
  if (expected.length) {
    await expect(
      widget(page, "Purchases in this view").locator(
        ".ag-studio-value-widget-content",
      ),
    ).toHaveText(String(expected.length));
    await expect(
      widget(page, "Saved purchases").getByRole("grid"),
    ).toHaveAttribute("aria-rowcount", String(expected.length + 1));
  }
}

const browser = await chromium.launch({ headless: true });
const profiles = [];
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
    });
    const blocked: string[] = [],
      errors: string[] = [];
    await context.route("**/*", (route) => {
      const request = route.request();
      if (
        !["GET", "HEAD"].includes(request.method()) ||
        new URL(request.url()).origin !== origin
      ) {
        blocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["dashboard", "vault", "documents", "insights"]) {
      const response = await page.goto(`${origin}/${route}`);
      assert.equal(response?.status(), 200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "dashboard" || route === "insights")
        await expect(
          page.getByLabel("Saved purchase totals").locator("dd"),
        ).toHaveText(["5", "6", "1"]);
      await page
        .getByRole("button", { name: "Ask CareOS", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
      await expect(
        dialog.getByText(
          "AI access expired · saved purchases remain available",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Send to CareOS" }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole("textbox", { name: "Ask about your purchase" }),
      ).toBeDisabled();
      await dialog.getByRole("button", { name: "Close CareOS" }).click();
      await page.screenshot({
        path: `${output}/${profile.name}-${route}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    const views = page.getByLabel("Insight views", { exact: true });
    await expect(
      views.getByRole("button", { name: "My Purchases", exact: true }),
    ).toBeEnabled({ timeout: 20000 });
    const original = await records(page);
    assert.equal(original.length, 5);
    assert.equal(original.filter((r) => r.sandbox).length, 1);
    await selected(page, original);
    await expect(
      page
        .getByTestId("customer-studio")
        .locator(".ag-studio-chart-widget canvas")
        .first(),
    ).toBeVisible();
    const filter = page.getByRole("group", {
      name: "Purchase evidence filters",
    });
    await filter
      .getByRole("button", { name: "Verified Sandbox", exact: true })
      .click();
    await selected(
      page,
      original.filter((r) => r.sandbox),
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    const audio = page
      .getByRole("group", { name: "Chart category selection" })
      .getByRole("button", { name: "Audio", exact: true });
    await audio.click();
    await expect(audio).toHaveAttribute("aria-pressed", "true");
    await selected(
      page,
      original.filter((r) => r.audio),
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    for (const name of [
      "Documents & Care",
      "Price Adjustments",
      "My Purchases",
    ]) {
      await views.getByRole("button", { name, exact: true }).click();
      await expect(
        views.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page
          .getByTestId("customer-studio")
          .getByTestId("insight-documents-care"),
      ).toBeVisible();
    }
    const save = async () => {
      await page
        .getByRole("button", { name: "Save layout", exact: true })
        .click();
      return page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) =>
          k.startsWith("palcare-personal-layout:v1:"),
        )!;
        return JSON.parse(localStorage.getItem(key)!);
      });
    };
    const before = await save();
    await page
      .getByRole("button", { name: "Customize layout", exact: true })
      .click();
    const count = widget(page, "Purchases in this view");
    const handle = count.locator(
      '.ag-studio-layout-widget-overlay-resize[data-direction="e"]',
    );
    await handle.evaluate((n) =>
      n.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    const edge = (await handle.boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      edge.x + edge.width / 2 - 80,
      edge.y + edge.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    const resized = await save();
    assert(
      resized.pages.purchases.count.xSpan < before.pages.purchases.count.xSpan,
    );
    await count.evaluate((n) =>
      n.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    const box = (await count.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    const moved = await save();
    assert(
      moved.pages.purchases.count.xTrack > resized.pages.purchases.count.xTrack,
    );
    assert.equal(
      moved.pages.purchases.count.xSpan,
      resized.pages.purchases.count.xSpan,
    );
    await page
      .getByRole("button", { name: "Finish layout editing", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reset views", exact: true })
      .click();
    await page.reload();
    await expect(
      views.getByRole("button", { name: "My Purchases", exact: true }),
    ).toBeEnabled({ timeout: 20000 });
    await filter
      .getByRole("button", { name: "Verified Sandbox", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restore layout", exact: true })
      .click();
    assert.deepEqual(await save(), moved);
    await selected(
      page,
      original.filter((r) => r.sandbox),
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reset views", exact: true })
      .click();
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    await writeFile(
      `${output}/${profile.name}-axe-findings.json`,
      JSON.stringify(violations, null, 2),
      { mode: 0o600 },
    );
    // Keep the vendor's unmodified watermark. Report its contrast limitation,
    // never hide it or claim a clean whole-page accessibility scan.
    const applicationFindings = violations.flatMap((v) =>
      v.nodes
        .filter(
          (n) =>
            !(
              v.id === "color-contrast" &&
              n.target.length === 1 &&
              n.target[0] === ".ag-studio-watermark-text"
            ),
        )
        .map((n) => ({ id: v.id, target: n.target })),
    );
    assert.deepEqual(applicationFindings, []);
    const verified = original.find((r) => r.sandbox)!;
    assert.equal(verified.id, "21301174-dcfa-4e19-b5cc-18f21e745700");
    assert.equal(
      verified.receipt,
      "/documents/aee87787-6493-4e6d-8b48-175317fc1be5",
    );
    await page.goto(origin + verified.receipt);
    await expect(
      page.getByRole("article", { name: "Document contents" }),
    ).toContainText("129.00");
    await expect(
      page.getByRole("link", {
        name: "Back to Everyday headphones",
        exact: true,
      }),
    ).toHaveAttribute("href", "/vault/" + verified.id);
    await page
      .getByRole("link", { name: "Back to Everyday headphones", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Everyday headphones",
    );
    await page.goto(origin + "/shop");
    const buyButtons = page.getByRole("button", {
      name: "Buy with PayPal Sandbox",
      exact: true,
    });
    assert((await buyButtons.count()) > 0);
    for (const button of await buyButtons.all())
      await expect(button).toBeDisabled();
    await page.goto(origin + "/ai-evaluation");
    await expect(
      page.getByRole("heading", { name: "Private CareOS evaluation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Connect selected scopes via SSH/ }),
    ).toHaveCount(0);
    assert.deepEqual(
      (await context.cookies()).filter((c) => c.name.startsWith("palcare-")),
      [],
    );
    assert.deepEqual(blocked, []);
    assert.deepEqual(errors, []);
    profiles.push({
      name: profile.name,
      routes: 4,
      purchases: 5,
      nativeGridChartKpi: true,
      crossFilter: true,
      dragResizeAndSavedLayout: true,
      exactReceipt: true,
      expiredAiAndPairingDenied: true,
      browserMutations: 0,
      axe: {
        applicationFindings: 0,
        retainedVendorWatermarkFindings: violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      },
    });
    await context.close();
  }
} finally {
  await browser.close();
}
const result = {
  origin,
  health,
  access,
  deniedAuthorizationProbes: probes,
  profiles,
  modelCalls: 0,
  financialCalls: 0,
  note: "Actual HTTPS Linux Chromium/emulation, not owner testing of every route or real-Mac lifecycle proof",
};
await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(result, null, 2));
