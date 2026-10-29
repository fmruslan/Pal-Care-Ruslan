import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Browser-only layout stress: source digests have the shape of saved evidence.
// No synthetic verified purchase or provider record is inserted into any DB.
const widths = [320, 375, 390, 430, 834, 1440];
const destinations = [
  ["Purchases", "/vault"],
  ["Insights", "/insights"],
  ["Documents", "/documents"],
  ["Home", "/dashboard"],
] as const;

async function noOverflow(page: Page, width: number) {
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    layout: innerWidth,
    visual: visualViewport?.width ?? innerWidth,
  }));
  // Compare to the configured viewport: mobile auto-expansion can make
  // scrollWidth === innerWidth while both exceed the actual screen width.
  for (const value of Object.values(dimensions))
    expect(value, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
}

async function reachable(control: Locator, width: number) {
  await expect(control).toBeVisible();
  const rect = await control.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    return {
      x: r.x,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      hit: !!hit && node.contains(hit),
    };
  });
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.right).toBeLessThanOrEqual(width + 1);
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.bottom).toBeLessThanOrEqual(901);
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
  expect(rect.hit).toBe(true);
}

for (const width of widths) {
  test(`customer reflow ${width}px: saved-source stress, navigation and CareOS`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const unexpected: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        !["GET", "HEAD"].includes(request.method()) ||
        /(^|\.)(paypal\.com|openai\.com|chatgpt\.com|channel3\.ai)$/.test(
          url.hostname,
        )
      ) {
        // Opening the assistant normally bootstraps a conversation. Keep this
        // presentation test write-free while still checking actual dialog UI.
        if (
          request.method() !== "POST" ||
          url.pathname !== "/api/careos/conversations"
        )
          unexpected.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({
          status: 503,
          json: { error: "layout_test_no_conversation_write" },
        });
      } else await route.continue();
    });
    await page.goto("/dashboard");
    const activity = page.getByRole("list", {
      name: "Unified purchase activity",
    });
    await expect(activity).toBeVisible();
    await activity
      .locator("p.break-words")
      .first()
      .evaluate((node) => {
        node.textContent = `Layout test source digest · ${"abc01234".repeat(8)}`;
      });
    await noOverflow(page, width);
    await page.screenshot({
      path: info.outputPath(`home-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    const nav = page.getByRole("navigation", {
      name: width < 1024 ? "Mobile navigation" : "Main navigation",
      exact: true,
    });
    await page.evaluate(() => scrollTo(0, 0));
    for (const link of await nav.getByRole("link").all())
      await reachable(link, width);
    const launcher = page.getByRole("button", {
      name: "Ask CareOS",
      exact: true,
    });
    await reachable(launcher, width);
    await launcher.focus();
    await expect(launcher).toBeFocused();
    await launcher.press("Enter");
    const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
    await expect(dialog).toBeVisible();
    const composer = dialog.getByLabel("Ask about your purchase", {
      exact: true,
    });
    await expect(composer).toBeVisible();
    await composer.fill("Layout-only draft; never submitted");
    await expect(composer).toHaveValue("Layout-only draft; never submitted");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(launcher).toBeFocused();
    for (const [name, path] of destinations) {
      const link = nav.getByRole("link", { name, exact: true });
      await reachable(link, width);
      await link.focus();
      await expect(link).toBeFocused();
      await link.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(nav.locator('[aria-current="page"]')).toHaveText(name);
      await noOverflow(page, width);
    }
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations;
    expect(violations.map(({ id, impact }) => ({ id, impact }))).toEqual([]);
    expect(unexpected).toEqual([]);
  });
}
