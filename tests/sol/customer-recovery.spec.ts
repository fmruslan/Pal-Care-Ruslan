import { test, expect } from "@playwright/test";
import { solTestScope } from "../helpers/sol-scopes";

test("a lost customer plan recovers by GET and requires explicit SDK application without another model POST", async ({
  page,
  context,
}) => {
  const { origin, studio } = solTestScope(test.info().project.name);
  await context.addCookies([
    { name: "palcare-ai-studio", value: studio, url: origin },
  ]);
  let planPosts = 0;
  let recoveryReads = 0;
  let releasePlanning!: () => void;
  const planningGate = new Promise<void>((resolve) => {
    releasePlanning = resolve;
  });
  await page.route("**/api/intelligence/customer/plan**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") recoveryReads++;
    if (
      request.method() === "POST" &&
      request.postDataJSON()?.action === "plan"
    ) {
      planPosts++;
      await planningGate;
      const saved = await route.fetch();
      expect(saved.status()).toBe(200);
      // Lose only the delivery after the real isolated server saved its plan.
      await route.abort("failed");
    } else await route.continue();
  });
  async function load() {
    await page.goto("/insights");
    await expect(page.getByTestId("insight-documents-care")).toBeVisible({
      timeout: 20000,
    });
    await page
      .getByRole("button", { name: "Explore with CareOS", exact: true })
      .click();
    return page.getByRole("dialog");
  }
  let dialog = await load();
  await dialog
    .getByLabel("Ask about your purchase")
    .fill("Which purchases have care instructions?");
  await dialog
    .getByRole("button", { name: "Send to CareOS", exact: true })
    .click();
  try {
    await expect(
      page
        .getByRole("group", {
          name: "Purchase evidence filters",
          includeHidden: true,
        })
        .getByRole("button", { name: "All", exact: true, includeHidden: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("customer-studio")).toHaveAttribute(
      "inert",
      "",
    );
  } finally {
    releasePlanning();
  }
  await expect(
    dialog.getByRole("button", { name: "Check for saved answer", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(planPosts).toBe(1);
  dialog = await load();
  await expect(dialog.locator("[data-pending-question]")).toContainText(
    "Which purchases have care instructions?",
  );
  expect(planPosts).toBe(1);
  await dialog
    .getByRole("button", { name: "Check for saved answer", exact: true })
    .click();
  await expect(dialog.getByText(/Planning result recovered/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "My Purchases",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(recoveryReads).toBe(1);
  await dialog
    .getByRole("button", { name: "Apply saved view", exact: true })
    .click();
  await expect(
    dialog.getByText(/1 saved purchase in your updated view/),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", {
      name: "Documents & Care",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(planPosts).toBe(1);
});
