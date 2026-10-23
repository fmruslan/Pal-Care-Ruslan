import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing page opens customer demo without registration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Everything you buy.",
  );
  await page
    .getByRole("link", { name: "Explore Pal Care", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alex");
  await expect(page.getByRole("note")).toContainText("Fictional customer");
});

test("vault search, filter and empty state work", async ({ page }) => {
  await page.goto("/vault");
  await page.getByLabel("Search purchases").fill("headphones");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 purchase");
  await expect(
    page.getByRole("heading", { name: "Everyday headphones", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search purchases").fill("not-in-catalog");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little space for everything you love.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Show all purchases" }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("Kitchen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 purchase");
  await expect(
    page.getByRole("heading", { name: "Pour-over kettle", exact: true }),
  ).toBeVisible();
});

test("Purchase Twin and downloadable receipt remain explicitly sample-only", async ({
  page,
  request,
}) => {
  await page.goto("/vault/00000000-0000-4000-8000-000000000201");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday headphones",
  );
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No live AI model is connected in fixture mode.", {
      exact: false,
    }),
  ).toBeVisible();
  const download = await request.get(
    "/api/documents/00000000-0000-4000-8000-000000000301/download",
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(download.headers()["content-type"]).toContain("text/plain");
  expect(await download.text()).toContain("No payment was processed.");
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
