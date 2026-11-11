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
  const postActions: string[] = [];
  const planRequests: { requestId: string; conversationId: string }[] = [];
  const reads: { phase: string; conversationId: string | null }[] = [];
  let readPhase = "bootstrap";
  let releasePlanning!: () => void;
  const planningGate = new Promise<void>((resolve) => {
    releasePlanning = resolve;
  });
  await page.route("**/api/intelligence/customer/plan**", async (route) => {
    const request = route.request();
    if (request.method() === "GET")
      reads.push({
        phase: readPhase,
        conversationId: new URL(request.url()).searchParams.get(
          "conversationId",
        ),
      });
    if (request.method() === "POST")
      postActions.push(request.postDataJSON()?.action);
    if (
      request.method() === "POST" &&
      request.postDataJSON()?.action === "plan"
    ) {
      planPosts++;
      const { requestId, conversationId } = request.postDataJSON();
      planRequests.push({ requestId, conversationId });
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
    const restoreOpen = await page.evaluate(() => {
      try {
        return (
          JSON.parse(
            sessionStorage.getItem("palcare-north-workspace-v1") ?? "null",
          )?.open === true
        );
      } catch {
        return false;
      }
    });
    if (!restoreOpen)
      await page
        .getByRole("button", { name: "Explore with North Star", exact: true })
        .click();
    const dialog = page.getByRole("dialog", {
      name: "North Star",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  let dialog = await load();
  await dialog
    .getByLabel("Ask about your purchases", { exact: true })
    .fill("Which purchases have care instructions?");
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
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
  expect(postActions).toEqual(["start", "plan"]);
  expect(reads).toEqual([]);
  const originalHint = await page.evaluate(() =>
    sessionStorage.getItem("palcare-insights-pending-v1"),
  );
  expect(originalHint).not.toBeNull();
  const original = JSON.parse(originalHint!);
  expect(planRequests).toEqual([
    { requestId: original.requestId, conversationId: original.conversationId },
  ]);
  const bootstrapResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/intelligence/customer/plan" &&
      url.searchParams.get("conversationId") === original.conversationId
    );
  });
  dialog = await load();
  expect((await bootstrapResponse).status()).toBe(200);
  await expect(dialog.locator("[data-pending-question]")).toContainText(
    "Which purchases have care instructions?",
  );
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    original.requestId,
  );
  const check = dialog.getByRole("button", {
    name: "Check for saved answer",
    exact: true,
  });
  // Reopening restores this chat's owned conversation by GET. That read must
  // finish once, without replaying the uncertain plan or applying its SDK view.
  await expect(check).toBeEnabled();
  expect(reads).toEqual([
    { phase: "bootstrap", conversationId: original.conversationId },
  ]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("palcare-insights-pending-v1"),
    ),
  ).toBe(originalHint);
  expect(planPosts).toBe(1);
  readPhase = "check";
  await check.click();
  await expect(dialog.getByText(/Planning result recovered/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "My Purchases",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const expectedReads = [
    { phase: "bootstrap", conversationId: original.conversationId },
    { phase: "check", conversationId: original.conversationId },
  ];
  expect(reads).toEqual(expectedReads);
  readPhase = "apply";
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
  expect(postActions).toEqual(["start", "plan"]);
  expect(reads).toEqual(expectedReads);
});
