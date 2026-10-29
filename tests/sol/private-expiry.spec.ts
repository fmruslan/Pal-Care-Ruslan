import { test, expect } from "@playwright/test";

test("expired AI leaves saved pages and native analytics useful without bootstrap or scripted fallback", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(new URL(request.url()).pathname);
  });
  // Isolated injected transport only; no host authorization files are read/changed.
  await page.clock.install({ time: new Date(Date.now() + 2 * 86400000) });
  for (const path of ["/dashboard", "/vault", "/documents", "/insights"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
    await expect(
      dialog.getByText("AI access expired · saved purchases remain available", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Send to CareOS" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("textbox", { name: "Ask about your purchase" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Close CareOS" }).click();
  }
  const group = page.getByRole("group", { name: "Purchase evidence filters" });
  await expect(
    group.getByRole("button", { name: "All", exact: true }),
  ).toBeEnabled();
  await group.getByRole("button", { name: "Samples", exact: true }).click();
  await expect(
    group.getByRole("button", { name: "Samples", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-chart-widget canvas")
      .first(),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

test("an already open assistant disables new work when its original window expires", async ({
  page,
}) => {
  await page.goto("/insights");
  await expect(
    page.getByRole("button", { name: "My Purchases", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
  const input = dialog.getByRole("textbox", {
    name: "Ask about your purchase",
  });
  await expect(input).toBeEnabled();
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(new URL(request.url()).pathname);
  });
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 2 * 86400000));
  await page.clock.runFor(1100);
  await expect(input).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Send to CareOS" }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Show my purchases", exact: true })
    .click({ force: true });
  expect(mutations).toEqual([]);
});
