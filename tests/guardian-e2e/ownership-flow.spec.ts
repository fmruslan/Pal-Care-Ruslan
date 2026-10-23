import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { guardianBrowserFixture } from "../helpers/guardian-flow";

test("synthetic test-DB flow: proactive opportunity → protected approval → injected refund proof", async ({
  page,
}, info) => {
  const fixture = await guardianBrowserFixture();
  let financialBrowserPosts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/checkout|\/execute/.test(r.url()))
      financialBrowserPosts++;
  });
  try {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", {
        name: "$20.00 merchant price adjustment found",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "View price adjustment", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Awaiting merchant approval",
    );
    if (info.project.name.startsWith("mobile"))
      await expect(
        page.getByRole("button", {
          name: "Ask about this adjustment",
          exact: true,
        }),
      ).toHaveCount(0);
    await expect(
      page.getByText("Controlled demo merchant price change", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/guardian-flow/${info.project.name}-opportunity.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto("/merchant/operator");
    await page
      .getByLabel("One-time private activation code")
      .fill(fixture.code);
    await page
      .getByRole("button", { name: "Activate operator access", exact: true })
      .click();
    await expect(
      page.getByText("Scoped operator access active.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Execute scoped Sandbox refund" }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: "Approve $20.00 proposal · no dispatch",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Action recorded" }),
    ).toBeVisible();
    await page.goto(`/guardian/${fixture.caseId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Approved · not submitted",
    );
    // This invokes a Node-only injected gateway against the test DB, NOT the API.
    await fixture.completeWithDouble();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Refund verified in PayPal Sandbox",
    );
    await expect(
      page.getByText("Effective cost after this verified adjustment:", {
        exact: false,
      }),
    ).toContainText("$109.00");
    await page.goto(`/vault/${fixture.twinId}`);
    await expect(
      page.getByRole("heading", {
        name: "$20.00 refunded in Sandbox.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Price Guardian event history" }),
    ).toContainText("refund · completed");
    await page.getByRole("link", { name: "View receipt", exact: true }).click();
    await expect(
      page.getByRole("article", { name: "Document contents" }),
    ).toContainText("USD 129.00");
    expect(financialBrowserPosts).toBe(0);
    await page.screenshot({
      path: `test-results/guardian-flow/${info.project.name}-receipt-unchanged.png`,
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
