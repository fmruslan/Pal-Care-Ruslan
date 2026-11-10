import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const headphones = "00000000-0000-4000-8000-000000000201";

test("Care is the default and has four calm destinations, factual cards and no automatic model calls", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.setViewportSize({ width: 390, height: 664 });
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Care for what you own.",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link"),
  ).toHaveText(["Care", "Purchases", "Insights", "Documents"]);
  await expect(page.locator("[data-north-search]")).toHaveCount(1);
  const main = page.getByRole("main");
  const calendar = page.getByRole("region", {
    name: "Your next 30 days",
    exact: true,
  });
  await expect(
    calendar.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  const card = main.locator(`[data-care-product="${headphones}"]`);
  await expect(main.locator("[data-care-product]")).toHaveCount(4);
  await expect(
    page
      .getByRole("navigation", { name: "Care filters", exact: true })
      .getByRole("link"),
  ).toHaveText([
    "All purchases (4)",
    "Needs attention",
    "Watching",
    "Completed",
  ]);
  await expect(card.locator("[data-ownership-pill]")).toBeVisible();
  await expect(card.locator("[data-care-timeline]")).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Details", exact: true }),
  ).toBeVisible();
  const action = await main
    .locator("[data-care-product]")
    .first()
    .getByRole("link", { name: "Details", exact: true })
    .boundingBox();
  const calendarBox = (await calendar.boundingBox())!;
  const calendarMargin = await calendar.evaluate((el) =>
    parseFloat(getComputedStyle(el).marginBottom),
  );
  // The owner added the calendar above the cards. Preserve the original
  // action-density budget after subtracting only that new, measured section.
  expect(
    action!.y + action!.height - calendarBox.height - calendarMargin,
  ).toBeLessThan(664);
  expect(
    (await main.locator("[data-care-product]").first().boundingBox())!.y,
  ).toBeGreaterThanOrEqual(calendarBox.y + calendarBox.height);
  expect((await card.boundingBox())!.height).toBeLessThan(210);
  expect(
    (await card.locator("[data-care-timeline]").boundingBox())!.height,
  ).toBeLessThan(60);
  await card.getByText("Sources", { exact: true }).click();
  await expect(card).toContainText("have not been established");
  await expect(card).toContainText("Review the original policy");
  await expect(
    page.getByRole("link", { name: "Compare prices", exact: true }),
  ).toHaveCount(0);
  await expect(card.getByRole("button", { name: /North/ })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("quiet card opens its exact purchase and honest protection evidence plus editable unsent drafts", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page
    .getByRole("main")
    .locator(`[data-care-product="${headphones}"]`)
    .getByRole("link", { name: "Details", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/vault/${headphones}$`));
  await page.locator("[data-ownership-unknowns] summary").click();
  await page.locator('[data-ownership-milestone="price"]').click();
  const evidence = page.getByRole("dialog", {
    name: "Price protection",
    exact: true,
  });
  await expect(evidence).toContainText("Protection not verified");
  await expect(evidence).toContainText("have not been established");
  await evidence
    .getByRole("button", {
      name: "Draft price adjustment message",
      exact: true,
    })
    .click();
  await expect(
    evidence.getByRole("textbox", {
      name: "Your price adjustment draft · not sent",
      exact: true,
    }),
  ).toHaveValue(/Protection not verified/);
  await evidence
    .getByRole("button", { name: "Close care details", exact: true })
    .click();
  await page.locator('[data-ownership-milestone="returns"]').click();
  await page
    .getByRole("button", { name: "Draft return message", exact: true })
    .click();
  const draft = page.getByRole("textbox", {
    name: "Your return draft · not sent",
  });
  await expect(draft).toContainText("Everyday headphones (F-01)");
  await draft.fill("Fictional return enquiry draft");
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await expect(draft).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close care details", exact: true })
    .click();
  await page.goto(`/care/${headphones}`); // Existing direct Care URLs remain supported.
  await expect(page.locator("#refunds")).toContainText("No verified refund");
  await expect(page.locator("#warranty")).toContainText(
    "No verified warranty expiration date",
  );
});

test("quiet ownership is neither an actionable finding, an active protection watch nor a completed task", async ({
  page,
}) => {
  for (const [filter, heading] of [
    ["attention", "No actionable care findings in the available records."],
    ["watching", "No verified price-protection monitoring is active."],
    ["completed", "No completed care tasks recorded."],
  ] as const) {
    await page.goto(`/dashboard?status=${filter}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").locator("[data-care-product]"),
    ).toHaveCount(0);
  }
  await page
    .getByRole("main")
    .getByRole("link", { name: "All purchases", exact: true })
    .click();
  await expect(
    page.getByRole("main").locator("[data-care-product]"),
  ).toHaveCount(4);
});

test("Completed has no invented outcomes and legacy library links preserve their scope", async ({
  page,
}) => {
  await page.goto("/dashboard?status=completed");
  await expect(
    page.getByRole("heading", { name: "No completed care tasks recorded." }),
  ).toBeVisible();
  await expect(page.locator("[data-care-card]")).toHaveCount(0);
  await page.goto("/dashboard?q=kettle&category=Kitchen");
  await expect(page).toHaveURL(/\/purchases\?q=kettle&category=Kitchen$/);
  await expect(
    page.getByRole("searchbox", {
      name: "Search products and documents",
      exact: true,
    }),
  ).toHaveValue("kettle");
  await expect(page.locator("[data-purchase-card]")).toHaveCount(1);
  await page.goto("/documents");
  await expect(page).toHaveURL(/\/documents$/);
});

test("North keeps the exact Care purchase and original answer across Care, Purchases and Insights without replay", async ({
  page,
}) => {
  const turns: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/(turns|interpret|plan)$/.test(new URL(r.url()).pathname)
    )
      turns.push(r.url());
  });
  await page.goto(`/care/${headphones}`);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const panel = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(panel.locator(".careos-context strong")).toContainText("F-01");
  expect(turns).toEqual([]);
  await panel
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("receipt");
  await panel
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(
    panel.getByLabel("Document contents", { exact: true }),
  ).toContainText("Example receipt. No payment was processed.");
  const original = await panel
    .locator("[data-request-id]")
    .last()
    .getAttribute("data-request-id");
  const count = turns.length;
  for (const destination of ["Purchases", "Documents", "Insights", "Care"]) {
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: destination, exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      panel.locator(`[data-request-id="${original}"]`),
    ).toBeVisible();
    await expect(
      panel.getByLabel("Document contents", { exact: true }),
    ).toContainText("Example receipt. No payment was processed.");
    await panel
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
  }
  expect(turns.length).toBe(count);
});

test("Care and details reflow at 320px and 200% text with accessible status and keyboard controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of [
    "/dashboard",
    "/dashboard?status=completed",
    `/care/${headphones}`,
    "/purchases",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("combobox", { name: "Appearance", exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main *, header *")]
        .flatMap((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.right > 321
            ? [
                {
                  tag: element.tagName,
                  class: element.className,
                  right: box.right,
                },
              ]
            : [];
        })
        .slice(0, 12),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${path}: ${JSON.stringify(overflow)}`,
    ).toBeLessThanOrEqual(321);
    const care = page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Care", exact: true });
    await care.focus();
    await expect(care).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});
