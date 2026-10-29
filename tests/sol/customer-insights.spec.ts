import { test, expect } from "@playwright/test";
import { solTestScope } from "../helpers/sol-scopes";

test("injected customer planning uses Studio capability, actual SDK state, strict scope and replay", async ({
  page,
  context,
}) => {
  const { origin, customer, studio } = solTestScope(test.info().project.name);
  let financial = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/(checkout|operator)/.test(r.url()))
      financial++;
  });
  const post = (data: unknown, from = origin) =>
    context.request.post("/api/intelligence/customer/plan", {
      headers: { Origin: from },
      data,
    });
  expect((await post({ action: "start" })).status()).toBe(403);
  await context.addCookies([
    { name: "palcare-ai-customer", value: customer, url: origin },
  ]);
  expect((await post({ action: "start" })).status()).toBe(403);
  await context.clearCookies();
  // Use the existing real access endpoint rather than inventing a client auth bypass.
  await page.goto("/ai-evaluation");
  await page.getByLabel("Evaluation scope").selectOption("studio");
  await page.getByLabel("Private scope token").fill(studio);
  await page
    .getByRole("button", { name: "Authorize this browser", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Scope authorized. Use its workspace link above.",
  );
  expect(
    (await post({ action: "start" }, "https://evil.example")).status(),
  ).toBe(403);
  expect(
    (await post({ action: "start", customerId: crypto.randomUUID() })).status(),
  ).toBe(400);
  const start = await post({ action: "start" });
  expect(start.status()).toBe(201);
  const conversationId = (await start.json()).id;
  const requestId = crypto.randomUUID();
  const input = {
    action: "plan",
    conversationId,
    requestId,
    message: "Show my purchases by category",
  };
  const first = await post(input);
  expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({
    outcome: "apply",
    commands: [{ operation: "category" }],
  });
  const replay = await post(input);
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(await first.json());
  expect(
    (await post({ ...input, message: "Show my documents" })).status(),
  ).toBe(409);
  const forbidden = await post({
    ...input,
    requestId: crypto.randomUUID(),
    message: "Approve and execute refunds",
  });
  expect(await forbidden.json()).toEqual({
    outcome: "unsupported",
    commands: [],
  });
  await page.goto("/insights");
  await page
    .getByRole("button", { name: "Explore interactive Insights", exact: true })
    .click();
  await expect(page.getByTestId("insight-documents-care")).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Explore with CareOS", exact: true })
    .click();
  const assistant = page.getByRole("dialog");
  await assistant
    .getByLabel("Ask about your purchase")
    .fill("Which purchases have care instructions?");
  await assistant
    .getByRole("button", { name: "Send to CareOS", exact: true })
    .click();
  await expect(
    assistant.getByText(/1 saved purchase in your updated view/),
  ).toBeVisible({ timeout: 20000 });
  await assistant
    .getByRole("button", { name: "Close CareOS", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Documents & Care", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("How CareOS changed this view", { exact: true }).click();
  await expect(page.getByTestId("customer-studio-tools")).toContainText(
    "view_schema",
  );
  await expect(page.getByTestId("customer-studio-tools")).toContainText(
    "personal_purchase_view",
  );
  await expect(page.getByTestId("customer-studio-tools")).toContainText(
    "view_page",
  );
  expect(financial).toBe(0);
});
