import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const kettle = "00000000-0000-4000-8000-000000000202";
const receipt = "00000000-0000-4000-8000-000000000302";
const search = (page: import("@playwright/test").Page) =>
  page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });

test("product-first Purchases retains four visible header destinations and an actionable product on the first mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/purchases");
  const nav = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await expect(nav.getByRole("link")).toHaveText([
    "Care",
    "Purchases",
    "Insights",
    "Documents",
  ]);
  await expect(nav).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation", exact: true }),
  ).toHaveCount(0);
  const product = page.locator("[data-purchase-card]").first();
  const open = product.locator(".library-product-link");
  await expect(open).toBeVisible();
  const box = await open.boundingBox();
  const geometry = await page.evaluate(() =>
    [
      ".customer-header",
      "h1",
      "[data-north-search]",
      "[data-testid='library-results']",
      "[data-purchase-card]",
      ".library-product-link",
    ].map((selector) => {
      const element = document.querySelector(selector);
      const r = element?.getBoundingClientRect();
      return { selector, y: r?.y, height: r?.height };
    }),
  );
  expect(box!.y + box!.height, JSON.stringify(geometry)).toBeLessThan(664);
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
  await page.goto("/purchases");
  // The server-rendered search field is visible before its draft state hydrates.
  await expect(
    page.getByRole("combobox", { name: "Appearance", exact: true }),
  ).toBeEnabled();
  await search(page).fill("kettle receipt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "1 purchase · 1 document",
  );
  const results = page.getByTestId("library-documents");
  await expect(results.locator("[data-document-id]")).toHaveCount(1);
  await results
    .getByRole("link", { name: /^Open Pour-over kettle receipt,/ })
    .click();
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
  await page
    .getByRole("link", { name: "Back to Purchases", exact: true })
    .click();
  await expect(search(page)).toHaveValue("kettle receipt");
  expect(forbidden).toEqual([]);
});

test("All documents is one action away; legacy routes preserve filters and document links", async ({
  page,
  request,
}) => {
  await page.goto("/purchases");
  await page.getByRole("link", { name: "All documents", exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);
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
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "All documents", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-purchase-card]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/documents\?q=kettle\+receipt$/);
  await page.goto("/vault?q=kettle&category=Kitchen");
  await expect(
    page.getByRole("combobox", { name: "Appearance", exact: true }),
  ).toBeEnabled();
  await expect(page.locator('input[id="library-search"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/purchases\?q=kettle&category=Kitchen$/);
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
  await expect(page).toHaveURL(/\/documents$/);
  expect(
    (await request.get(`/api/documents/${receipt}/download`)).status(),
  ).toBe(200);
});

test("Documents categories compose with metadata and exact dated purchase filters without leaving document view", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(request.url());
  });
  await page.goto("/documents");
  const categories = page.getByRole("navigation", {
    name: "Document categories",
    exact: true,
  });
  await expect(categories.getByRole("link")).toHaveText([
    /^Receipts\s*\d+$/,
    /^Warranties & coverage\s*\d+$/,
    /^Care guides & manuals\s*\d+$/,
    /^Returns & policies\s*\d+$/,
    /^All documents\s*\d+$/,
  ]);
  await categories.getByRole("link", { name: /^Receipts/ }).click();
  await expect(page).toHaveURL(/\/documents\?documentCategory=receipts$/);
  await page
    .locator("summary")
    .filter({ hasText: /^Filters & sort/ })
    .click();
  await page
    .getByRole("combobox", { name: "Purchase and date", exact: true })
    .selectOption(kettle);
  await page
    .getByRole("combobox", { name: "Purchase source", exact: true })
    .selectOption("sample");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("view") === "documents" &&
      url.searchParams.get("product") === kettle &&
      url.searchParams.get("documentCategory") === "receipts",
  );
  await expect(page.locator("[data-document-id]")).toHaveCount(1);
  await expect(page.locator("[data-document-id]")).toHaveAttribute(
    "data-document-id",
    receipt,
  );
  await search(page).fill("kettle receipt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/documents" &&
      url.searchParams.get("product") === kettle &&
      url.searchParams.get("source") === "sample" &&
      url.searchParams.get("documentCategory") === "receipts" &&
      url.searchParams.get("q") === "kettle receipt",
  );
  await expect(page.locator("[data-purchase-card]")).toHaveCount(0);
  await page
    .getByTestId("library-documents")
    .getByRole("link", { name: /^Open Pour-over kettle receipt,/ })
    .click();
  await expect(page).toHaveURL((url) => {
    const from = new URL(
      url.searchParams.get("from")!,
      "https://palcare.invalid",
    );
    return (
      url.pathname === `/documents/${receipt}` &&
      from.pathname === "/documents" &&
      from.searchParams.get("product") === kettle &&
      from.searchParams.get("documentCategory") === "receipts"
    );
  });
  await page.goBack();
  await expect(search(page)).toHaveValue("kettle receipt");
  await categories
    .getByRole("link", { name: /^Warranties & coverage/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "No matching documents", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-document-id]")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Show all documents", exact: true }),
  ).toHaveAttribute("href", "/documents");
  expect(mutations).toEqual([]);
});

test("legacy Documents view retains category, product, source and page through canonical pagination", async ({
  page,
}) => {
  await page.goto(
    `/purchases?view=documents&documentCategory=receipts&product=${kettle}&source=sample&page=2`,
  );
  await expect(
    page.getByRole("heading", { name: "Your documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Receipts", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-document-id]")).toHaveCount(1);
  const categories = page.getByRole("navigation", {
    name: "Document categories",
    exact: true,
  });
  await expect(
    categories.getByRole("link", { name: /^Care guides & manuals/ }),
  ).toHaveAttribute(
    "href",
    `/documents?source=sample&documentCategory=care&product=${kettle}`,
  );
  await categories
    .getByRole("link", { name: /^Care guides & manuals/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "No saved documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Official Raspberry Pi guidance is available in Product care, separate from this list",
      {
        exact: false,
      },
    ),
  ).toBeVisible();
});

test("visible product sections, dated receipt, source labels and safe return navigation", async ({
  page,
}) => {
  await page.goto(
    `/vault/${kettle}?from=${encodeURIComponent("https://evil.test/dashboard")}`,
  );
  await expect(
    page.getByRole("link", { name: "Back to Purchases", exact: true }),
  ).toHaveAttribute("href", "/purchases");
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
  await expect(page.locator("#documents")).toContainText("Example document");
  await page.getByRole("link", { name: "View receipt", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("Example receipt. No payment was processed.");
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
  await page
    .getByRole("link", { name: "Back to Purchases", exact: true })
    .click();
  await expect(search(page)).toHaveValue("Retain this Home-library draft");
  await search(page).fill("kettle receipt");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByTestId("library-documents")
    .getByRole("link", { name: /^Open Pour-over kettle receipt,/ })
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
    "/purchases",
    "/purchases?view=documents",
    "/documents",
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
    await nav.getByRole("link", { name: "Purchases", exact: true }).focus();
    await expect(
      nav.getByRole("link", { name: "Purchases", exact: true }),
    ).toBeFocused();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  }
});
