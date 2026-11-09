import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const themeKey = "palcare-appearance";
const twin = "/vault/00000000-0000-4000-8000-000000000201";
const dataSource = process.env.E2E_DATA_SOURCE ?? "fixtures";

test("purchase details use the existing assistant, keep drafts across appearance changes and send no model turn", async ({
  page,
}) => {
  const turns: string[] = [],
    remoteFonts: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/turns$|\/plan$/.test(new URL(request.url()).pathname)
    )
      turns.push(request.url());
    if (
      /fonts\.(googleapis|gstatic)\.com/.test(new URL(request.url()).hostname)
    )
      remoteFonts.push(request.url());
  });
  await page.goto("/purchases");
  await expect(page.locator("[data-purchase-card]")).toHaveCount(4);
  await page
    .getByRole("link", { name: /^View details for Everyday headphones,/ })
    .click();
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(
    dialog.getByText("Everyday headphones · F-01", { exact: true }),
  ).toBeVisible();
  const composer = dialog.getByLabel("Ask about your purchases", {
    exact: true,
  });
  await composer.fill("Keep my unsent care question");
  // Inline results close/reopen without losing the shared draft.
  await dialog.getByRole("button", { name: "Close North Star" }).click();
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  await expect(composer).toHaveValue("Keep my unsent care question");
  await expect(dialog.locator(".careos-composer")).toHaveCSS(
    "background-color",
    "rgb(69, 82, 95)",
  );
  await expect(page.locator("header").first()).toHaveCSS(
    "background-color",
    "rgb(39, 51, 62)",
  );
  await composer.focus();
  await expect(composer).toHaveCSS("outline-style", "solid");
  await expect(composer).toHaveCSS("outline-width", "2px");
  await expect(composer).toHaveCSS("outline-color", "rgb(208, 202, 255)");
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toMatch(/inter/i);
  expect(turns).toEqual([]);
  expect(remoteFonts).toEqual([]);
});

test("System is the default, follows OS changes, and updates native/browser colors", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dashboard");
  const selector = page.getByRole("combobox", { name: "Appearance" });
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveValue("system");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(
    page.locator('meta[name="theme-color"]').first(),
  ).toHaveAttribute("content", "#1d2630");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(selector).toHaveValue("system");
  await expect(
    page.locator('meta[name="theme-color"]').first(),
  ).toHaveAttribute("content", "#f8f9fc");
});

test("Light/Dark overrides persist across reload/navigation and System restores OS following", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /hydrat|did not match|server.rendered/i.test(m.text())
    )
      hydrationErrors.push(m.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dashboard");
  const selector = page.getByRole("combobox", { name: "Appearance" });
  await selector.selectOption("light");
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), themeKey),
  ).toBe("light");
  await page.reload();
  await expect(selector).toHaveValue("light");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.goto("/documents");
  await expect(selector).toHaveValue("light");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: "light" });
  await selector.selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(selector).toHaveValue("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await selector.selectOption("system");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(hydrationErrors).toEqual([]);
});

test("theme is initialized when the first page heading arrives, with no hydration errors", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|did not match/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("h1")) {
        document.documentElement.dataset.firstHeadingTheme =
          document.documentElement.classList.contains("dark")
            ? "dark"
            : document.documentElement.classList.contains("light")
              ? "light"
              : "unset";
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-first-heading-theme",
    info.project.name.endsWith("dark") ? "dark" : "light",
  );
  await expect(
    page.getByRole("combobox", { name: "Appearance" }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("blocked local storage falls back to System without breaking the app", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      value() {
        throw new DOMException("Unavailable", "SecurityError");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      value() {
        throw new DOMException("Unavailable", "SecurityError");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue(
    "system",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Care for what you own.",
  );
});

test("theme changes preserve checkout state and never create extra financial POSTs (mock UI transport)", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000901";
  let posts = 0;
  const view = {
    id,
    state: "created",
    product: {},
    approvalUrl: null,
    twinId: null,
    error: null,
    expiresAt: "2099-01-01T00:00:00.000Z",
    captureAttempted: false,
  };
  await page.route(`**/api/checkout/orders/${id}`, (route) =>
    route.fulfill({ json: view }),
  );
  await page.route(`**/api/checkout/orders/${id}/capture`, (route) => {
    posts++;
    return route.fulfill({
      json: { ...view, state: "pending", captureAttempted: true },
    });
  });
  await page.goto(`/checkout/${id}`);
  await expect(page.getByRole("status")).toContainText(
    "Ready for buyer approval",
  );
  const selector = page.getByRole("combobox", { name: "Appearance" });
  await selector.selectOption("dark");
  await selector.selectOption("light");
  await selector.selectOption("system");
  expect(posts).toBe(0);
  await page
    .getByRole("button", { name: "Check / complete this sandbox payment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "confirmation is pending",
  );
  await selector.selectOption("dark");
  await selector.selectOption("light");
  await expect(page.getByRole("status")).toContainText(
    "confirmation is pending",
  );
  expect(posts).toBe(1);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("keyboard theme selection, reduced motion and mobile navigation remain accessible", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const selector = page.getByRole("combobox", { name: "Appearance" });
  await expect(selector).toBeEnabled();
  await selector.focus();
  await expect(selector).toBeFocused();
  await selector.press("ArrowDown");
  await expect(selector).toHaveValue("light");
  await selector.selectOption("dark");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const card = page.locator(".care-action-card").first();
  expect(
    await card.evaluate((element) =>
      getComputedStyle(element)
        .transitionDuration.split(",")
        .every((value) => parseFloat(value) < 0.001),
    ),
  ).toBe(true);
  if (!info.project.name.startsWith("desktop")) {
    const nav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText([
      "Care",
      "Purchases",
      "Insights",
      "Documents",
    ]);
    for (const link of await nav.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await nav.getByRole("link", { name: "Insights", exact: true }).click();
    await expect(page).toHaveURL(/\/insights$/);
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Insights");
    await nav.getByRole("link", { name: "Purchases", exact: true }).click();
    await page
      .getByRole("link", { name: "All documents", exact: true })
      .click();
    await expect(page).toHaveURL(/\/documents$/);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("large text and narrow reflow do not cause page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(twin);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "125%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

for (const [name, path] of [
  ["home", "/"],
  ["dashboard", "/dashboard"],
  ["purchases", "/purchases"],
  ["about", "/about"],
  ["insights", "/insights"],
  ["passport", twin],
  ["shop", "/shop"],
]) {
  test(`visual regression: ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("combobox", { name: "Appearance" }),
    ).toBeEnabled();
    if (name === "insights") {
      // Provenance differs intentionally between bundled preview and database
      // records. Never mask it or compare both modes to a fixture reference.
      await expect(
        page.getByText(
          dataSource === "database"
            ? /available purchases · newest 100 saved purchase window/
            : /available purchases · bundled sample preview/,
        ),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("customer-studio")
          .locator(".ag-studio-chart-widget canvas")
          .first(),
      ).toBeVisible({ timeout: 20_000 });
    }
    if (name === "home" || name === "dashboard") {
      await expect(
        page.locator('[data-care-calendar-engine="verified"]'),
      ).toBeVisible({ timeout: 20000 });
      // Observe the SDK's own five-second notice lifecycle; never hide/mask it.
      await expect(
        page.locator(".care-calendar-studio .ag-studio-watermark"),
      ).toBeHidden({ timeout: 10000 });
    }
    await expect(page).toHaveScreenshot(
      name === "insights" && dataSource === "database"
        ? "insights-database.png"
        : `${name}.png`,
      // Rolling UTC text changes daily. Only those date labels are masked;
      // widget geometry, native rendering, event behavior and thresholds remain tested.
      {
        mask:
          name === "home" || name === "dashboard"
            ? [page.locator("[data-care-calendar-dates]")]
            : [],
      },
    );
    await page.screenshot({
      path: `test-results/${dataSource}/design/${test.info().project.name}-${name}-full.png`,
      fullPage: true,
    });
  });
}
