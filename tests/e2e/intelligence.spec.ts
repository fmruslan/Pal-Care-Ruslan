import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("intelligence separates real records and scenarios, with actual local Studio widgets", async ({
  page,
}, info) => {
  let financial = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/(checkout|operator)/.test(r.url()))
      financial++;
  });
  await page.goto("/merchant/intelligence");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Intelligence, with evidence.",
  );
  await expect(
    page.getByText("Recorded data · no sample scenarios", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No adjustment cases");
  await page
    .getByRole("button", {
      name: "Explore illustrative scenarios",
      exact: true,
    })
    .click();
  await page.getByLabel("Case stage").selectOption("Pending");
  await expect(
    page.getByText("Illustrative completed amount · not a real refund", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByLabel("Case stage").selectOption("All");
  await page.screenshot({
    path: `test-results/intelligence-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open AG Studio", exact: true })
    .click();
  for (const widget of [
    "value-recovery",
    "adjustment-status",
    "evidence-freshness",
  ])
    await expect(page.getByTestId(`studio-${widget}`)).toBeVisible({
      timeout: 20000,
    });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Widget data could not be validated" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("studio-value-recovery")).toContainText(
    "$20.00",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `test-results/intelligence-studio-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByTestId("studio-adjustment-status")
    .getByRole("button", { name: "Pending 1", exact: true })
    .click();
  await expect(
    page.getByTestId("studio-value-recovery").locator("p").nth(1),
  ).toHaveText("$0.00");
  await page
    .getByRole("button", { name: "Save layout locally", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("layout saved");
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Default layout restored",
  );
  const assistant = page.getByRole("region", {
    name: "Scripted Studio assistant",
  });
  await assistant
    .getByRole("button", { name: "Show pending refunds", exact: true })
    .click();
  await expect(assistant.getByRole("status")).toContainText(
    "Scripted command applied: pending",
  );
  await expect(page.getByLabel("Case stage")).toHaveValue("Pending");
  await expect(
    page.getByTestId("studio-value-recovery").locator("p").nth(1),
  ).toHaveText("$0.00");
  await page.getByLabel("Case stage").selectOption("Approved");
  await expect(
    page
      .getByTestId("studio-value-recovery")
      .getByText("$20.00", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Analytics filter scope")).toContainText(
    "Scope: Approved",
  );
  await assistant
    .getByRole("button", { name: "Reset this dashboard", exact: true })
    .click();
  await expect(assistant.getByRole("status")).toContainText(
    "Scripted command applied: reset",
  );
  await expect(page.getByLabel("Case stage")).toHaveValue("All");
  await expect(
    page.getByTestId("studio-value-recovery").locator("p").nth(1),
  ).toHaveText("$20.00");
  // The semantic fallback remains available without stacking two full dashboards.
  await page
    .getByText("Accessible summary · same selected data", { exact: true })
    .click();
  await expect(page.getByTestId("intelligence-summary")).toBeVisible();
  await page
    .getByText("Accessible summary · same selected data", { exact: true })
    .click();
  await assistant
    .getByRole("button", { name: "Add a verified-refund summary", exact: true })
    .click();
  await expect(assistant.getByRole("status")).toContainText(
    "Scripted command applied: add-summary",
  );
  await assistant
    .getByRole("button", { name: "Add a verified-refund summary", exact: true })
    .click();
  await expect(page.getByTestId("studio-value-recovery")).toHaveCount(2);
  expect(financial).toBe(0);
});
