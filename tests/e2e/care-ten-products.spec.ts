import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Server projections use the current clock, not the immutable November 5 pack.
// Do not freeze only the browser: that would disagree with server-owned facts.
const cutoff = (value: string) => Date.now() >= Date.parse(value);
const currentDemoStatuses = (): Record<string, string> => ({
  201: "Catalog price example",
  202: cutoff("2026-11-07T18:00:00Z")
    ? "Delivery unconfirmed"
    : "Delivery expected",
  203: "Safety review",
  204: cutoff("2026-11-10T12:00:00Z")
    ? "Price review window closed"
    : "Illustrative price window",
  205: cutoff("2029-10-20T12:00:00Z")
    ? "Warranty period ended"
    : "Warranty details",
  206: "Return progress example",
  207: cutoff("2026-11-08T12:00:00Z")
    ? "Return window closed"
    : "Return ends Nov 8",
  208: "Refund example",
  209: cutoff("2026-11-15T12:00:00Z")
    ? "Price review window closed"
    : "Price check example",
  210: cutoff("2026-11-07T12:00:00Z")
    ? "Return window closed"
    : "Return ends Nov 7",
});
const currentAttentionCount = () =>
  2 +
  Number(!cutoff("2026-11-10T12:00:00Z")) +
  Number(!cutoff("2026-11-08T12:00:00Z")) +
  Number(!cutoff("2026-11-07T12:00:00Z"));

test("30-day calendar queries the real Studio engine and opens the exact dated Twin/evidence", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const panel = page.getByRole("region", {
    name: "Your next 30 days",
    exact: true,
  });
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  const today = new Date().toISOString().slice(0, 10),
    last = new Date(Date.parse(today) + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
  await expect(panel).toHaveAttribute(
    "data-care-calendar-range",
    `${today}/${last}`,
  );
  await expect(panel.locator(".ag-studio-layout")).toBeVisible();
  // The vendor notice remains present and readable even in its fading state.
  await expect(panel.locator(".ag-studio-watermark")).toHaveCSS("opacity", "1");
  await expect(panel.locator("[data-care-today]")).toHaveText("Today");
  let links = panel.locator("[data-care-calendar-event]");
  // The immutable Demo dates must age out honestly. Still exercise exact
  // navigation through the full saved timeline when the rolling window is empty.
  if ((await links.count()) === 0) {
    await expect(panel.locator("[data-care-calendar-empty]")).toBeVisible();
    await panel
      .getByRole("link", { name: "View all care events", exact: true })
      .click();
    const all = page.getByRole("region", {
      name: "All care events",
      exact: true,
    });
    await expect(
      all.locator('[data-care-calendar-engine="verified"]'),
    ).toBeVisible({ timeout: 20000 });
    links = all
      .getByRole("list", { name: "All saved Care events", exact: true })
      .locator('a[href*="milestone=return-window"]');
  }
  const href = await links.first().getAttribute("href");
  expect(href).toMatch(
    /^\/vault\/[a-f0-9-]+\?milestone=(return-window|price|warranty|delivery)&careEvent=.+$/,
  );
  await links.first().click();
  await expect(page).toHaveURL(new RegExp(href!.replaceAll("?", "\\?")));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Demo");
  const factId = new URL(href!, "http://test.local").searchParams.get(
    "careEvent",
  )!;
  await expect(
    page.getByRole("dialog").locator(`[data-ownership-fact="${factId}"]`),
  ).toHaveCount(1);
  await expect(
    page.getByRole("dialog").locator(`[data-ownership-fact="${factId}"]`),
  ).toBeVisible();
  await page.goBack();
  await page.goto("/dashboard");
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("main").locator("[data-care-product]"),
  ).toHaveCount(10);
});

test("View all opens Insights native grid and timeline with real evidence filtering and exact row read-back", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("link", { name: "View all care events", exact: true })
    .click();
  await expect(page).toHaveURL(/\/insights\?view=care-events#care-events$/);
  const panel = page.getByRole("region", {
    name: "All care events",
    exact: true,
  });
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await expect(panel.locator(".ag-root")).toBeVisible({ timeout: 20000 });
  await expect(
    panel.getByRole("columnheader", { name: /Product/ }),
  ).toBeVisible();
  const allDates = panel.locator("details").filter({
    has: page.locator("summary").filter({ hasText: /^All saved dates/ }),
  });
  await expect(allDates).not.toHaveAttribute("open");
  await allDates.locator(":scope > summary").click();
  await expect(
    panel.getByText(/Warranty expiration/, { exact: true }).first(),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Event evidence" })
    .selectOption("Verified Sandbox");
  await expect(panel.locator("[data-care-event-counts]")).toContainText(
    "0 Demo · 0 verified Sandbox · 0 recorded",
  );
  await expect(panel.locator("[data-care-calendar-engine]")).toHaveAttribute(
    "data-care-calendar-ids",
    "",
  );
  await expect(panel.locator("[data-care-calendar-empty]")).toBeVisible();
  await expect(panel.locator(".ag-center-cols-container .ag-row")).toHaveCount(
    0,
  );
  await panel
    .getByRole("combobox", { name: "Event evidence" })
    .selectOption("Demo");
  await expect(
    panel.locator("[data-care-calendar-engine]"),
  ).not.toHaveAttribute("data-care-calendar-ids", "");
  await expect(
    page.getByRole("region", {
      name: "Interactive purchase workspace",
      exact: true,
    }),
  ).toBeVisible();
});

test("calendar scrolls inside its panel at 320px/200% text without page overflow and retains keyboard links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", {
    name: "Your next 30 days",
    exact: true,
  });
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const scroll = panel.getByRole("region", {
    name: "30-day Care calendar, scroll horizontally",
    exact: true,
  });
  await scroll.focus();
  await expect(scroll).toBeFocused();
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      scroll.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return Array.from(
          el.querySelectorAll<HTMLElement>("[data-care-calendar-event]"),
        ).some((card) => {
          const r = card.getBoundingClientRect();
          return r.top < box.top || r.bottom > box.bottom;
        });
      }),
    )
    .toBe(false);
  await panel
    .getByRole("button", { name: "Next dates →", exact: true })
    .click();
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await panel.getByRole("button", { name: "Today", exact: true }).click();
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include("#next-30-days").analyze())
      .violations,
  ).toEqual([]);
});

test("consumer calendar has one swipe surface, no native frames or vertical clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", {
    name: "Your next 30 days",
    exact: true,
  });
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  const scroll = panel.locator("[data-care-calendar-viewport]");
  await expect
    .poll(() =>
      panel.evaluate((root) =>
        Array.from(root.querySelectorAll<HTMLElement>("*"))
          .filter((el) => {
            const s = getComputedStyle(el);
            return (
              ["auto", "scroll"].includes(s.overflowY) &&
              el.scrollHeight > el.clientHeight + 2
            );
          })
          .map((el) => el.className),
      ),
    )
    .toEqual([]);
  const horizontal = await panel.evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLElement>("*"))
      .filter((el) => {
        const s = getComputedStyle(el);
        return (
          ["auto", "scroll"].includes(s.overflowX) &&
          el.scrollWidth > el.clientWidth + 2
        );
      })
      .map((el) => el.hasAttribute("data-care-calendar-viewport")),
  );
  expect(horizontal).toEqual([true]);
  await expect(panel.locator(".ag-studio-root-inner")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(panel.locator(".ag-studio-layout")).toHaveCSS("padding", "0px");
  await expect(panel.locator(".ag-studio-layout-widget-container")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(
    await scroll.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  const clipping = await scroll.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Array.from(
      el.querySelectorAll<HTMLElement>("[data-care-calendar-event]"),
    ).some((card) => {
      const r = card.getBoundingClientRect();
      return r.top < box.top || r.bottom > box.bottom;
    });
  });
  expect(clipping).toBe(false);
});

test("consumer cards use one disclosure, soft truthful statuses and one active milestone", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const cards = page.getByRole("main").locator("[data-care-consumer]");
  await expect(cards).toHaveCount(10);
  for (const card of await cards.all()) {
    await expect(card.locator("[data-care-primary-action]")).toHaveCount(1);
    await expect(card.locator("[data-ownership-pill]")).not.toContainText(
      /Demo|Refund complete/,
    );
    await expect(card.locator("[data-ownership-pill] > svg")).toHaveCount(1);
    await expect(
      card.locator('[data-care-milestone-active="true"]'),
    ).toHaveCount(1);
    await expect(
      card.locator('[data-care-status-tone="verified"]'),
    ).toHaveCount(0);
    await expect(card.locator("[data-ownership-pill]")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
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
  await expect(page.getByRole("main")).not.toContainText("0 verified windows");
  await expect(page.locator("[data-care-demo-disclosure]")).toHaveCount(1);
  await expect(page.locator("[data-care-demo-disclosure]")).toHaveText(
    "Sample collection · Illustrative purchases and care events",
  );
  const expected = currentDemoStatuses();
  for (const [suffix, status] of Object.entries(expected))
    await expect(
      page.locator(
        `[data-care-product="00000000-0000-4000-8000-000000000${suffix}"] [data-ownership-pill]`,
      ),
    ).toHaveText(status);
  await expect(
    page.locator('[data-care-product="00000000-0000-4000-8000-000000000208"]'),
  ).toContainText("No PayPal refund was issued");
  const events = page.locator("[data-care-calendar-event]");
  for (const event of await events.all())
    await expect(event).not.toContainText("Demo");
});

test("current UTC facts keep ended returns and passed delivery estimates honest in cards and details", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.goto("/dashboard");
  for (const [suffix, deadline, action] of [
    ["207", "2026-11-08T12:00:00Z", "Review return options"],
    ["210", "2026-11-07T12:00:00Z", "Check return conditions"],
    ["202", "2026-11-07T18:00:00Z", "View delivery details"],
  ]) {
    const card = page.locator(
      `[data-care-product="00000000-0000-4000-8000-000000000${suffix}"]`,
    );
    const status = currentDemoStatuses()[suffix];
    await expect(card.locator("[data-ownership-pill]")).toHaveText(status);
    await card.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: status, exact: true });
    await expect(dialog).toBeVisible();
    if (cutoff(deadline)) {
      await expect(dialog).toContainText(
        suffix === "202"
          ? "Delivery is not confirmed"
          : "The return deadline has passed",
      );
      await expect(dialog).not.toContainText("days remaining");
    }
    await expect(dialog).toContainText(
      suffix === "202"
        ? /no live carrier connection/i
        : /nothing has been submitted/i,
    );
    await page.keyboard.press("Escape");
  }
  const phone = page.locator(
    '[data-care-product="00000000-0000-4000-8000-000000000209"]',
  );
  await expect(phone).toContainText("No external tracker is connected");
  const pi = page.locator(
    '[data-care-product="00000000-0000-4000-8000-000000000204"]',
  );
  await expect(pi).toContainText(
    "purchase price is still missing; eligibility is unverified",
  );
  expect(writes).toEqual([]);
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
    ["201", "Review opportunity", "Catalog price example", "$20.00"],
    [
      "206",
      "View return progress",
      "Return progress example",
      "Inspection pending",
    ],
    [
      "208",
      "View refund details",
      "Refund example",
      "No PayPal refund was issued",
    ],
  ]) {
    const card = page.locator(
      `[data-care-product="00000000-0000-4000-8000-000000000${suffix}"]`,
    );
    await card.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: heading, exact: true });
    await expect(dialog).toContainText("Demo event");
    await expect(dialog).toContainText("· Sample");
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
    .getByRole("link", { name: "Completed (0)", exact: true })
    .click();
  await expect(
    page.getByRole("main").locator("[data-care-product]"),
  ).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText(
    "No completed care tasks recorded",
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
  await expect(filters.locator('a[href="/dashboard"]')).toContainText("(10)");
  await expect(
    filters.getByRole("link", {
      name: `Needs attention (${currentAttentionCount()})`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    filters.getByRole("link", { name: "Watching (0)", exact: true }),
  ).toBeVisible();
  await expect(
    filters.getByRole("link", { name: "Completed (0)", exact: true }),
  ).toBeVisible();
  // Coverage information includes explicitly simulated warranties, not a
  // count of verified protection. The legacy query destination is retained.
  await expect(filters.locator('a[href*="status=protected"]')).toHaveText(
    "Coverage info (3)",
  );
  await expect(filters).not.toContainText("Protected (3)");
  await expect(main).not.toContainText("active verified windows");
  await expect(main).toContainText("Sample collection");
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
  await expect(
    page.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await page.screenshot({
    path: info.outputPath("ten-products.png"),
    fullPage: true,
    animations: "disabled",
  });
  await filters
    .getByRole("link", {
      name: `Needs attention (${currentAttentionCount()})`,
      exact: true,
    })
    .click();
  await expect(cards).toHaveCount(currentAttentionCount());
  await expect(main).toContainText("Safety review");
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
  await card.getByRole("button", { name: /Safety.*Safety review/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No official recall match is established");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
