import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("consumer cards use readable type, one primary action and a Demo label beside each fictional event", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const cards = page.getByRole("main").locator("[data-care-consumer]");
  await expect(cards).toHaveCount(10);
  for (const card of await cards.all()) {
    await expect(card.locator("[data-care-primary-action]")).toHaveCount(1);
    await expect(
      card.locator("[data-ownership-pill] [data-care-demo]"),
    ).toHaveText("Demo");
    expect(
      await card
        .getByRole("heading", { level: 2 })
        .evaluate((n) => parseFloat(getComputedStyle(n).fontSize)),
    ).toBeGreaterThanOrEqual(18);
    expect(
      await card
        .locator("p")
        .first()
        .evaluate((n) => parseFloat(getComputedStyle(n).fontSize)),
    ).toBeGreaterThanOrEqual(14);
    await expect(card.locator("[data-care-primary-action]")).not.toContainText(
      /example|simulated|evidence/i,
    );
    await expect(card.getByRole("button", { name: /Ask North/ })).toHaveCount(
      0,
    );
  }
  await expect(page.getByRole("main")).not.toContainText("0 verified");
});

test("saved Demo price, return-progress and refund sources open useful next steps without dispatching anything", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/dashboard");
  for (const [suffix, action, heading, evidence] of [
    ["201", "Review opportunity", "Price protection opportunity", "$20.00"],
    [
      "206",
      "View return progress",
      "Return being reviewed",
      "Inspection pending",
    ],
    [
      "208",
      "View refund details",
      "Refund complete",
      "No real refund was issued",
    ],
  ]) {
    const card = page.locator(
      `[data-care-product="00000000-0000-4000-8000-000000000${suffix}"]`,
    );
    await card.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: heading, exact: true });
    await expect(dialog).toContainText("Demo event");
    await expect(dialog).toContainText("Next step:");
    await expect(dialog).toContainText(evidence);
    await expect(
      dialog.getByRole("link", { name: "Demo source document", exact: true }),
    ).toHaveAttribute(
      "href",
      /\/documents\/00000000-0000-4000-8000-00000000120[168]$/,
    );
    await page.keyboard.press("Escape");
    await expect(
      card.getByRole("button", { name: action, exact: true }),
    ).toBeFocused();
  }
  await page
    .getByRole("navigation", { name: "Care filters", exact: true })
    .getByRole("link", { name: "Completed (1)", exact: true })
    .click();
  await expect(
    page.getByRole("main").locator("[data-care-product]"),
  ).toHaveCount(1);
  await expect(page.getByRole("main")).toContainText(
    "No real refund was issued",
  );
  expect(writes).toEqual([]);
});

test("ten persisted-fixture products use a compact responsive grid, real filters and no automatic writes", async ({
  page,
}, info) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/dashboard");
  const main = page.getByRole("main");
  const cards = main.locator("[data-care-product]");
  await expect(cards).toHaveCount(10);
  await expect(
    main.getByRole("region", { name: "Your products" }),
  ).toBeVisible();
  const filters = page.getByRole("navigation", {
    name: "Care filters",
    exact: true,
  });
  await expect(filters.getByRole("link")).toHaveText([
    "All products (10)",
    "Needs attention (5)",
    "Watching (1)",
    "Protected (3)",
    "Completed (1)",
  ]);
  await expect(main).not.toContainText("active verified windows");
  await expect(main).toContainText("Demo collection");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  if (info.project.name.startsWith("desktop")) {
    expect(first!.y).toBe(second!.y);
    // Owner-approved readable type replaces the former 215px compactness target.
    expect(first!.height).toBeLessThanOrEqual(392);
  } else expect(second!.y).toBeGreaterThan(first!.y);
  const dimensions = await cards.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-care-product"),
      height: node.getBoundingClientRect().height,
    })),
  );
  await info.attach("card-dimensions.json", {
    body: JSON.stringify(dimensions),
    contentType: "application/json",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(writes).toEqual([]);
  await page.screenshot({
    path: info.outputPath("ten-products.png"),
    fullPage: true,
    animations: "disabled",
  });
  await filters
    .getByRole("link", { name: "Needs attention (5)", exact: true })
    .click();
  await expect(cards).toHaveCount(5);
  await expect(main).toContainText("Safety check needed");
});

test("exact refrigerator shows separate fictional amount and sourced retail snapshot", async ({
  page,
}) => {
  await page.goto("/vault/00000000-0000-4000-8000-000000000205");
  const prices = page.getByRole("region", {
    name: "Purchase and retail reference prices",
  });
  await expect(prices).toContainText("$1,199.00");
  await expect(prices).toContainText("$1,099.00");
  await expect(prices).toContainText(
    "Model/variant reference, not verified ownership",
  );
  await expect(
    prices.getByRole("link", { name: "View retailer source" }),
  ).toHaveAttribute("href", /WRT311FZDW/);
  await expect(prices).toContainText("direct page unavailable");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Refrigerator",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Pi remains unpriced and paperback reference is never an identical hardcover", async ({
  page,
}) => {
  await page.goto("/vault/00000000-0000-4000-8000-000000000204");
  let prices = page.getByRole("region", {
    name: "Purchase and retail reference prices",
  });
  await expect(prices).toContainText("not a $0 purchase");
  await expect(prices).toContainText("$175.00");
  await expect(prices).toContainText("no difference was calculated");
  await page.goto("/vault/00000000-0000-4000-8000-000000000208");
  prices = page.getByRole("region", {
    name: "Purchase and retail reference prices",
  });
  await expect(prices).toContainText("$24.95");
  await expect(prices).toContainText("$21.99");
  await expect(prices).toContainText(
    "Comparable product, not verified identical",
  );
  await expect(prices).toContainText("paperback");
});

test("320px enlarged-text cards and source controls remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/dashboard");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect(
    page.getByRole("main").locator("[data-care-product]"),
  ).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const card = page
    .getByRole("main")
    .locator('[data-care-product="00000000-0000-4000-8000-000000000203"]');
  await card
    .getByRole("button", { name: /Safety.*Safety check needed/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No official recall match is established");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
