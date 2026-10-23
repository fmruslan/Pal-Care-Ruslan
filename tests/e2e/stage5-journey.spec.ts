import { test, expect } from "@playwright/test";
const twin = "00000000-0000-4000-8000-000000000201";
test("customer journey preserves purchase identity through CareOS, recall, replacement and receipt", async ({
  page,
}, info) => {
  let financial = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/(checkout|operator)/.test(r.url()))
      financial++;
  });
  await page.goto(`/vault/${twin}`);
  const activity = page.getByRole("list", {
    name: "Unified purchase activity",
  });
  await expect(activity).toBeVisible();
  await expect(activity).not.toContainText("Kettle · sample receipt");
  await expect(activity).not.toContainText("Raspberry Pi");
  await page
    .getByRole("button", { name: "Ask about this product", exact: true })
    .click();
  await page
    .getByLabel("Ask about your purchase", { exact: true })
    .fill("Is this recalled?");
  await page
    .getByRole("button", { name: "Send to CareOS", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: "Review official recall evidence and limits",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/safety\\?twinId=${twin}`));
  await expect(
    page.getByRole("button", { name: "Ask CareOS", exact: true }),
  ).toBeVisible();
  // Desktop keeps its dock open across navigation; close it to use the page beneath.
  const close = page.getByRole("button", { name: "Close CareOS", exact: true });
  if (await close.isVisible()) await close.click();
  await page
    .getByRole("link", {
      name: "Consider care and replacement options →",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/replacements\\?twinId=${twin}`));
  await expect(
    page
      .getByRole("navigation", { name: "Replacement category" })
      .locator('[aria-current="page"]'),
  ).toHaveText("Headphones");
  await expect(
    page.getByRole("button", { name: "Ask CareOS", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Return to source product →", exact: true })
    .click();
  await page.getByRole("link", { name: "View receipt", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("Forma");
  expect(financial).toBe(0);
  await test.info().attach("connected-customer-journey", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(info.project.name).toBeTruthy();
});
test("air-fryer reference handoff stays labeled, retains CareOS and never invents a receipt", async ({
  page,
}) => {
  await page.goto("/safety?example=insignia");
  await page
    .getByRole("link", {
      name: "Consider care and replacement options →",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/replacements\?example=insignia$/);
  await expect(
    page
      .getByRole("navigation", { name: "Replacement category" })
      .locator('[aria-current="page"]'),
  ).toHaveText("Air fryers");
  await page.reload();
  await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "CareOS", exact: true }),
  ).toContainText("NS-AF34D2");
  await page
    .getByLabel("Ask about your purchase", { exact: true })
    .fill("Find receipt");
  await page
    .getByRole("button", { name: "Send to CareOS", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "CareOS", exact: true }),
  ).toContainText("no Purchase Twin, PayPal payment or saved receipt");
  await test.info().attach("air-fryer-context", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("merchant mobile destinations stay in the merchant workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/merchant/intelligence");
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav.getByRole("link")).toHaveText(["Merchant", "Intelligence"]);
  await nav.getByRole("link", { name: "Merchant", exact: true }).click();
  await expect(page).toHaveURL(/\/merchant$/);
});
