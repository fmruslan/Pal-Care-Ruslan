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
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const assistant = page.getByRole("dialog");
  await expect(
    assistant.getByText("Everyday headphones · F-01", { exact: true }),
  ).toBeVisible();
  await assistant
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("Find receipt");
  await assistant
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(
    assistant.getByText("Saved-record answer · no live AI"),
  ).toBeVisible();
  const requestId = await assistant
    .locator("article[data-request-id]")
    .getAttribute("data-request-id");
  expect(requestId).not.toBeNull();
  await assistant
    .getByRole("link", { name: "View full receipt or document", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/documents\/00000000-0000-4000-8000-000000000301$/,
  );
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("Example receipt. No payment was processed.");
  if (!(await assistant.isVisible()))
    await page
      .getByRole("button", { name: "Explore with North Star", exact: true })
      .click();
  // The original document reader is already visible; North must not duplicate
  // that receipt preview. Its retained answer still exposes the exact source.
  await expect(
    assistant.getByRole("region", { name: "Receipt and document preview" }),
  ).toHaveCount(0);
  await expect(assistant.locator("article[data-request-id]")).toHaveAttribute(
    "data-request-id",
    requestId!,
  );
  await assistant.locator("summary").filter({ hasText: "Sources (2)" }).click();
  const source = assistant.locator(
    `a[href="/documents/00000000-0000-4000-8000-000000000301"]`,
  );
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute(
    "href",
    "/documents/00000000-0000-4000-8000-000000000301",
  );
  await expect(
    assistant.getByText("Saved-record answer · no live AI"),
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
    page.getByRole("button", { name: "Explore with North Star", exact: true }),
  ).toBeFocused();
  expect(financialRequests).toBe(0);
});
