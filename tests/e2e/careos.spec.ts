import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const twin = "/vault/00000000-0000-4000-8000-000000000201";
test("CareOS finds the scoped receipt and stays available during navigation", async ({
  page,
}) => {
  let financialRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/checkout") && r.method() === "POST")
      financialRequests++;
  });
  await page.goto(twin);
  await page.getByRole("button", { name: "Ask about this product" }).click();
  const assistant = page.getByRole("dialog");
  await expect(
    assistant.getByText("Everyday headphones · F-01", { exact: true }),
  ).toBeVisible();
  await assistant.getByRole("button", { name: "Find receipt" }).click();
  await expect(
    assistant.getByText("From saved records · no model call"),
  ).toBeVisible();
  await assistant
    .getByRole("link", { name: "Open receipt", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/documents\/00000000-0000-4000-8000-000000000301$/,
  );
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("SAMPLE DATA ONLY");
  if (!(await assistant.isVisible()))
    await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  await expect(
    assistant.getByRole("link", { name: "Open receipt", exact: true }),
  ).toBeVisible();
  await expect(
    assistant.getByText("From saved records · no model call"),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(assistant).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask CareOS", exact: true }),
  ).toBeFocused();
  expect(financialRequests).toBe(0);
});
