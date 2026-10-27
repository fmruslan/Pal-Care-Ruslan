import { test, expect } from "@playwright/test";
import { referenceContent } from "../../src/lib/careos/knowledge";
const supportedInstruction = referenceContent.split("\n")[0];
const pi = "00000000-0000-4000-8000-000000000204";
test("injected Sol protocol: separate private scopes, actual Studio tools, grounded care and replay", async ({
  page,
  context,
}) => {
  let financial = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/(checkout|operator)/.test(r.url()))
      financial++;
  });
  const denied = await context.request.post("/api/intelligence/plan", {
    headers: { Origin: "http://127.0.0.1:3112" },
    data: { action: "start" },
  });
  expect(denied.status()).toBe(403);
  await page.goto("/ai-evaluation");
  await page.getByLabel("Private scope token").fill("b".repeat(64));
  await page.getByRole("button", { name: "Authorize this browser" }).click();
  await expect(page.getByRole("status")).toContainText("invalid"); // Studio token cannot unlock customer scope.
  await page.getByLabel("Evaluation scope").selectOption("studio");
  await page.getByLabel("Private scope token").fill("b".repeat(64));
  await page.getByRole("button", { name: "Authorize this browser" }).click();
  await expect(page.getByRole("status")).toContainText("authorized");
  await page.goto("/merchant/intelligence");
  await page
    .getByRole("button", {
      name: "Explore illustrative scenarios",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Open AG Studio", exact: true })
    .click();
  const assistant = page.getByRole("region", { name: "Sol Studio assistant" });
  await assistant
    .getByLabel("Dashboard request")
    .fill(
      "Separate pending adjustments and open evidence behind verified refunds",
    );
  await assistant
    .getByRole("button", { name: "Apply presentation", exact: true })
    .click();
  await expect(assistant.getByRole("status")).toContainText(
    "Sol Medium planned: reset, add-summary, evidence",
  );
  await expect(page.getByTestId("studio-value-recovery")).toHaveCount(2);
  await expect(page.getByLabel("Case stage")).toHaveValue("All");
  await assistant.getByLabel("Dashboard request").fill("Approve every refund");
  await assistant
    .getByRole("button", { name: "Apply presentation", exact: true })
    .click();
  await expect(assistant.getByRole("status")).toContainText(
    "Financial actions are unavailable",
  );
  await page.goto("/ai-evaluation");
  await page.getByLabel("Private scope token").fill("a".repeat(64));
  await page.getByRole("button", { name: "Authorize this browser" }).click();
  await expect(page.getByRole("status")).toContainText("authorized");
  await page.goto(`/vault/${pi}`);
  await page
    .getByRole("button", { name: "Ask about this product", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Product care", exact: true })
    .click();
  await expect(
    dialog.getByText("Live AI · check sources", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(supportedInstruction, {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText(supportedInstruction, { exact: true }),
  ).toBeVisible();
  const ready = await context.request.get("/api/ready");
  expect(ready.status()).toBe(200);
  expect((await ready.json()).features.careos).toBe("responses");
  expect(financial).toBe(0);
});
