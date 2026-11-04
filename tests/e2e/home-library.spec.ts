import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const kettle = "00000000-0000-4000-8000-000000000202";
const receipt = "00000000-0000-4000-8000-000000000302";
const search = (page: import("@playwright/test").Page) =>
  page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });

test("product-first Home has two visible header destinations and an actionable product on the first mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await expect(nav.getByRole("link")).toHaveText(["Home", "Insights"]);
  await expect(nav).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation", exact: true }),
  ).toHaveCount(0);
  const product = page.locator("[data-purchase-card]").first();
  const open = product.locator(".library-product-link");
  await expect(open).toBeVisible();
  const box = await open.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(664);
  await expect(product.locator("[data-product-art]")).toBeVisible();
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("link", { name: "All documents", exact: true }),
  ).toBeVisible();
});

test("unified search opens the exact receipt directly and restores search state through browser Back", async ({
  page,
}) => {
  const forbidden: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD") forbidden.push(r.url());
  });
  await page.goto("/dashboard");
  await search(page).fill("kettle receipt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 purchase · 1 document",
  );
  const results = page.getByTestId("library-documents");
  await expect(results.locator("[data-document-id]")).toHaveCount(1);
  await results.getByRole("link", { name: /^Open Kettle/ }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/documents/${receipt}`,
  );
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("Hearth");
  await page.goBack();
  await expect(search(page)).toHaveValue("kettle receipt");
  await expect(results.locator("[data-document-id]")).toHaveCount(1);
  await page
    .locator(`[data-purchase-card="${kettle}"] .library-product-link`)
    .click();
  await page.getByRole("link", { name: "Back to Home", exact: true }).click();
  await expect(search(page)).toHaveValue("kettle receipt");
  expect(forbidden).toEqual([]);
});

test("All documents is one action away; legacy routes preserve filters and document links", async ({
  page,
  request,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "All documents", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?view=documents$/);
  await expect(
    page.getByRole("heading", { name: "All documents", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("library-documents")).toContainText(
    "Oct 12, 2026",
  );
  await search(page).fill("kettle receipt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Matching purchases", exact: true }),
  ).toBeVisible();
  await page.goto("/vault?q=kettle&category=Kitchen");
  await expect(
    page.getByRole("combobox", { name: "Appearance", exact: true }),
  ).toBeEnabled();
  await expect(page.locator('input[id="library-search"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/dashboard\?q=kettle&category=Kitchen$/);
  await expect(search(page)).toHaveValue("kettle");
  await page
    .locator("summary")
    .filter({ hasText: /^Filters & sort/ })
    .click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(
    "Kitchen",
  );
  await page.goto("/documents");
  await expect(
    page.getByRole("combobox", { name: "Appearance", exact: true }),
  ).toBeEnabled();
  await expect(page.locator('input[id="library-search"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/dashboard\?view=documents$/);
  expect(
    (await request.get(`/api/documents/${receipt}/download`)).status(),
  ).toBe(200);
});

test("visible product sections, dated receipt, source labels and safe return navigation", async ({
  page,
}) => {
  await page.goto(
    `/vault/${kettle}?from=${encodeURIComponent("https://evil.test/dashboard")}`,
  );
  await expect(
    page.getByRole("link", { name: "Back to Home", exact: true }),
  ).toHaveAttribute("href", "/dashboard");
  const nav = page.getByRole("navigation", {
    name: "Purchase sections",
    exact: true,
  });
  await expect(nav.getByRole("link")).toHaveText([
    "Overview",
    "Documents (1)",
    "Care & History",
  ]);
  await expect(page.locator("#documents")).toBeVisible();
  await expect(page.locator("#care-history")).toBeVisible();
  await nav.getByRole("link", { name: "Documents (1)", exact: true }).click();
  await expect(page).toHaveURL(/#documents$/);
  await expect(page.locator("#documents")).toContainText("Sample document");
  await page.getByRole("link", { name: "View receipt", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("SAMPLE DATA ONLY");
});

test("one North field retains drafts until explicit search, while pinned context survives product, document and Insights navigation without auto-send", async ({
  page,
}) => {
  const turns: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/(turns|interpret|plan)$/.test(new URL(r.url()).pathname)
    )
      turns.push(r.url());
  });
  await page.goto(`/vault/${kettle}`);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  const composer = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await composer.fill("Retain this Home-library draft");
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page.getByRole("link", { name: "Back to Home", exact: true }).click();
  await expect(search(page)).toHaveValue("Retain this Home-library draft");
  await search(page).fill("kettle receipt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByTestId("library-documents")
    .getByRole("link", { name: /^Open Kettle/ })
    .click();
  await page
    .getByRole("button", {
      name: "Ask North Star about this document",
      exact: true,
    })
    .click();
  await expect(composer).toHaveValue("");
  await composer.fill("Continue care after the explicit metadata search");
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Pour-over kettle · H-02",
  );
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Insights", exact: true })
    .click();
  await expect(page.getByTestId("customer-studio")).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  await expect(composer).toHaveValue(
    "Continue care after the explicit metadata search",
  );
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Pour-over kettle · H-02",
  );
  expect(turns).toEqual([]);
  expect(errors).toEqual([]);
});

test("library, product and document reflow at 320px and 200% text with keyboard-visible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of [
    "/dashboard",
    "/dashboard?view=documents",
    `/vault/${kettle}`,
    `/documents/${receipt}`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("combobox", { name: "Appearance", exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(321);
    const nav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    await nav.getByRole("link", { name: "Home", exact: true }).focus();
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).toBeFocused();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  }
});
