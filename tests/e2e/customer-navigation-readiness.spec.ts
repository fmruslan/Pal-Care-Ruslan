import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// Deterministically leave Insights while its actual native SDK import is held.
// No sleeps, longer assertions, disabled SDK, financial/model call or fake view.
const chunks = ".next/static/chunks";
const sdkChunk = readdirSync(chunks).find(
  (name) =>
    name.endsWith(".js") &&
    readFileSync(join(chunks, name), "utf8").includes(
      "ag-studio-value-widget-content-container",
    ),
);
if (!sdkChunk)
  throw new Error(
    "Native Studio build chunk required for navigation regression",
  );

for (const width of [375, 430, 1440]) {
  test(`customer navigation ${width}px: leave a held SDK import, then leave a ready native workspace`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    const prohibited: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        !["GET", "HEAD"].includes(request.method()) ||
        /(^|\.)(paypal\.com|openai\.com|chatgpt\.com|channel3\.ai)$/.test(
          url.hostname,
        )
      ) {
        if (!(
          request.method() === "POST" &&
          url.pathname === "/api/careos/conversations"
        ))
          prohibited.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({
          status: 503,
          json: { error: "navigation_test_no_write" },
        });
      }
      return route.continue();
    });
    let signalImport!: () => void;
    const importRequested = new Promise<void>((resolve) => {
      signalImport = resolve;
    });
    let releaseImport!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    let held = false;
    await page.route(`**/_next/static/chunks/${sdkChunk}*`, async (route) => {
      held = true;
      signalImport();
      await gate;
      await route.continue();
    });
    const nav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "North Star",
      exact: true,
    });
    const draft = "Preserve this draft while the native workspace initializes";
    try {
      await page.goto("/purchases");
      await page.getByRole("button", { name: "History", exact: true }).click();
      await dialog
        .getByLabel("Ask about your purchases", { exact: true })
        .fill(draft);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await nav
        .getByRole("link", { name: "Insights", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/\/insights$/);
      await importRequested;
      expect(held).toBe(true);
      await nav
        .getByRole("link", { name: "Purchases", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/\/purchases$/);
      await nav
        .getByRole("link", { name: "Documents", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/\/documents$/);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(
        "Documents",
      );
      releaseImport();
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(
        dialog.getByLabel("Ask about your purchases", { exact: true }),
      ).toHaveValue(draft);
      await page.keyboard.press("Escape");
      await nav
        .getByRole("link", { name: "Insights", exact: true })
        .press("Enter");
      await expect(
        page.getByRole("button", { name: "My Purchases", exact: true }),
      ).toBeEnabled({ timeout: 20000 });
      await expect(page.getByTestId("insight-documents-care")).toBeVisible();
      await nav
        .getByRole("link", { name: "Purchases", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/\/purchases$/);
      await nav
        .getByRole("link", { name: "Documents", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/\/documents$/);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(
        "Documents",
      );
      const field = page.getByRole("searchbox", {
        name: "Search products and documents",
        exact: true,
      });
      await field.fill("receipt");
      await expect(
        page.getByRole("button", { name: "Ask North Star", exact: true }),
      ).toHaveText(/Ask North/);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get("q") === "receipt" &&
          (url.pathname === "/documents" ||
            (url.pathname === "/purchases" &&
              url.searchParams.get("view") === "documents")),
      );
      await expect(nav.locator('[aria-current="page"]')).toHaveText(
        "Documents",
      );
      await page.goto("/purchases?view=documents");
      await expect(nav.locator('[aria-current="page"]')).toHaveText(
        "Documents",
      );
      expect(errors).toEqual([]);
      expect(prohibited).toEqual([]);
    } finally {
      releaseImport();
    }
  });
}
