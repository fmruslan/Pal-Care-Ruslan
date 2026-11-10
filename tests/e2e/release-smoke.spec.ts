import { test, expect } from "@playwright/test";

test("exact release serves Care, unchanged documents and native Insights without dispatch", async ({
  page,
  request,
  baseURL,
}) => {
  const errors: string[] = [],
    writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const r = route.request();
    if (!["GET", "HEAD"].includes(r.method())) {
      writes.push(r.url());
      return route.abort();
    }
    if (new URL(r.url()).origin !== new URL(baseURL!).origin)
      return route.abort();
    return route.continue();
  });
  expect((await request.get("/api/ready")).status()).toBe(200);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Care for what you own.",
  );
  await expect(
    page.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible();
  await page.goto("/purchases");
  await expect(page.locator("[data-purchase-card]").first()).toBeVisible();
  const id = "00000000-0000-4000-8000-000000000301";
  const original = await request.get(`/api/documents/${id}/download`);
  expect(original.status()).toBe(200);
  await page.goto(`/documents/${id}`);
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("$149.00");
  await page.getByText("View original record", { exact: true }).click();
  expect(await page.locator("pre").textContent()).toBe(await original.text());
  await page.goto("/insights");
  const studio = page.getByTestId("customer-studio");
  await expect(studio.getByRole("grid")).toBeVisible();
  await expect(
    studio.locator(".ag-studio-chart-widget canvas").first(),
  ).toBeVisible();
  for (const name of ["Documents & Care", "Price Adjustments", "My Purchases"])
    await page
      .getByLabel("Insight views", { exact: true })
      .getByRole("button", { name, exact: true })
      .click();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
