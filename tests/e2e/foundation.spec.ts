import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("default Care opens the customer library without registration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Care for what you own.",
  );
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Purchases", exact: true })
    .click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your products",
  );
  await expect(page.getByRole("note")).toContainText(
    "fictional Sample purchases",
  );
});

test("vault search, filter and empty state work", async ({ page }) => {
  await page.goto("/vault");
  // A streamed Next response can briefly contain an inaccessible staging copy.
  // Target the actual accessible control, then require one hydrated DOM form.
  const search = page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
  await expect(search).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: "Appearance", exact: true }),
  ).toBeEnabled();
  await expect(page.locator('input[id="library-search"]')).toHaveCount(1);
  await search.fill("headphones");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 purchase");
  await expect(
    page.getByRole("heading", { name: "Everyday headphones", exact: true }),
  ).toBeVisible();
  await search.fill("not-in-catalog");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "No matching purchases",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Show all purchases" }).first().click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(search).toHaveValue("");
  await page.getByText("Filters & sort", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).toHaveValue("all");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Kitchen");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("1 purchase");
  await expect(
    page.getByRole("heading", { name: "Pour-over kettle", exact: true }),
  ).toBeVisible();
});

test("Purchase Twin and downloadable receipt remain explicitly sample-only", async ({
  page,
  request,
}) => {
  const turns: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/(turns|interpret|plan)$/.test(new URL(request.url()).pathname)
    )
      turns.push(request.url());
  });
  await page.goto("/vault/00000000-0000-4000-8000-000000000201");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday headphones",
  );
  const passport = page.getByRole("article", {
    name: "Purchase details",
    exact: true,
  });
  await expect(
    passport.getByText("Sample amount $149.00", { exact: true }),
  ).toBeVisible();
  await expect(passport).toContainText(
    "Fictional sample purchase · not a verified PayPal purchase.",
  );
  await passport
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await dialog.getByText("Conversation settings", { exact: true }).click();
  await expect(
    dialog.getByText(
      "Demo · no live AI. Clearing history keeps your purchases and doesn’t restore your AI allowance.",
      { exact: true },
    ),
  ).toBeVisible();
  const download = await request.get(
    "/api/documents/00000000-0000-4000-8000-000000000301/download",
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(download.headers()["content-type"]).toContain("text/plain");
  expect(await download.text()).toContain("No payment was processed.");
  expect(turns).toEqual([]);
});

test("merchant workspace is public and has no consequential actions", async ({
  page,
  request,
}) => {
  await page.goto("/merchant");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday Goods",
  );
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByText("Verified sandbox transactions", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /approve|refund|edit/i }),
  ).toHaveCount(0);
  for (const path of [
    "/api/refunds",
    "/api/merchant/approve",
    "/api/checkout",
  ]) {
    const response = await request.post(path, { data: { amount: 10000 } });
    expect([404, 405]).toContain(response.status());
  }
  await page.getByRole("link", { name: "Customer view" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("malformed and unknown record IDs do not expose data", async ({
  request,
}) => {
  for (const id of ["not-a-uuid", "00000000-0000-4000-8000-999999999999"]) {
    expect((await request.get(`/api/documents/${id}/download`)).status()).toBe(
      404,
    );
    expect((await request.get(`/vault/${id}`)).status()).toBe(404);
  }
  const denied = await request.post(
    "/api/documents/00000000-0000-4000-8000-000000000301/download",
  );
  expect(denied.status()).toBe(405);
});

test("health endpoints and security headers are present", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({
    status: "ok",
    payments: "sandbox-configurable",
  });
  expect(health.headers()["x-frame-options"]).toBe("DENY");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  const ready = await request.get("/api/ready");
  expect(await ready.json()).toMatchObject({
    status: "ready",
    records: "demo",
  });
});

for (const path of [
  "/",
  "/dashboard",
  "/purchases",
  "/care/00000000-0000-4000-8000-000000000201",
  "/about",
  "/vault",
  "/documents",
  "/merchant",
  "/shop",
  "/vault/00000000-0000-4000-8000-000000000201",
  "/documents/00000000-0000-4000-8000-000000000301",
  "/vault/00000000-0000-4000-8000-000000000204/care",
]) {
  test(`accessible and responsive: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
    if (path === "/dashboard")
      await page.screenshot({
        path: `test-results/dashboard-${test.info().project.name}.png`,
        fullPage: true,
      });
  });
}
