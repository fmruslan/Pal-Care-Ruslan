import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoData } from "../../src/lib/demo/fixtures";
import { withTenProductFixtures } from "../../src/lib/care/demo/catalog";
import { withConsumerDemoFixtures } from "../../src/lib/care/demo/consumer-evidence";

test("every saved example document has useful readable content and a byte-identical original", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120000);
  const data = withConsumerDemoFixtures(withTenProductFixtures(demoData));
  const inventory: { id: string; title: string; text: string }[] = [];
  for (const doc of data.documents) {
    await page.goto(`/documents/${doc.id}`);
    const article = page.getByRole("article", { name: "Document contents" });
    await expect(
      article.locator('[data-document-presentation="validated"]'),
    ).toBeVisible();
    await expect(article.locator("pre")).toHaveCount(0);
    const text = await article.innerText();
    expect(text).not.toMatch(
      /"twinId"|"simulated"|PAL CARE —|schema|00000000-0000/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const title = await page.getByRole("heading", { level: 1 }).innerText();
    expect(title).not.toMatch(/simulated Care|Demo source/);
    await expect(page.locator("pre")).toBeHidden();
    await page.getByText("View original record", { exact: true }).click();
    expect(await page.locator("pre").textContent()).toBe(doc.content);
    const download = await request.get(`/api/documents/${doc.id}/download`);
    expect(await download.text()).toBe(doc.content);
    await expect(page.getByRole("link", { name: /^Back to / })).toHaveAttribute(
      "href",
      new RegExp(`/vault/${doc.twinId}`),
    );
    inventory.push({ id: doc.id, title, text });
  }
  expect(inventory).toHaveLength(23);
  await info.attach("document-content-inventory", {
    body: JSON.stringify(inventory, null, 2),
    contentType: "application/json",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("all product and care routes retain source links and readable content", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const data = withConsumerDemoFixtures(withTenProductFixtures(demoData));
  const inventory: { route: string; text: string }[] = [];
  for (const twin of data.twins)
    for (const route of [
      `/vault/${twin.id}`,
      `/care/${twin.id}`,
      `/vault/${twin.id}/care`,
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const text = await page.getByRole("main").innerText();
      expect(text).not.toMatch(/"twinId"|"simulated"|PAL CARE —/);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      inventory.push({ route, text });
    }
  await info.attach("product-content-inventory", {
    body: JSON.stringify(inventory, null, 2),
    contentType: "application/json",
  });
});

// Server projections use the current clock, not the immutable November 5 pack.
// Do not freeze only the browser: that would disagree with server-owned facts.
const cutoff = (value: string) => Date.now() >= Date.parse(value);
const currentDemoStatuses = (): Record<string, string> => ({
  201: "Illustrative price comparison",
  202: cutoff("2026-11-07T18:00:00Z")
    ? "Delivery unconfirmed"
    : "Delivery expected",
  203: "Safety review",
  204: cutoff("2026-11-10T12:00:00Z")
    ? "Price review window closed"
    : "Price review example",
  205: cutoff("2029-10-20T12:00:00Z")
    ? "Warranty period ended"
    : "Warranty details",
  206: "Return progress example",
  207: cutoff("2026-11-08T12:00:00Z") ? "Window ended" : "Return ends Nov 8",
  208: "Refund example",
  209: cutoff("2026-11-15T12:00:00Z")
    ? "Price review window closed"
    : "Price check example",
  210: cutoff("2026-11-07T12:00:00Z") ? "Window ended" : "Return ends Nov 7",
});
const currentAttentionCount = () =>
  2 +
  Number(!cutoff("2026-11-10T12:00:00Z")) +
  Number(!cutoff("2026-11-08T12:00:00Z")) +
  Number(!cutoff("2026-11-07T12:00:00Z"));

test("unified Care orders useful help, saved priority actions, real calendar, all products and purchase journey", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/dashboard");
  await expect(
    page.getByText("Your purchases, important dates, and the help you need.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("More tools", { exact: true })).toHaveCount(0);
  const help = page.getByRole("navigation", {
    name: "Find help for your purchases",
    exact: true,
  });
  await expect(
    help.getByRole("link", { name: "Find a receipt", exact: true }),
  ).toHaveAttribute("href", "/documents?documentCategory=receipts");
  await expect(
    help.getByRole("link", { name: "Care guides", exact: true }),
  ).toHaveAttribute("href", "/documents?documentCategory=care");
  const attention = page.locator("[data-care-attention]");
  await expect(attention.locator("[data-care-attention-product]")).toHaveCount(
    currentAttentionCount(),
  );
  await expect(attention).toContainText("Safety review");
  await expect(attention).toContainText("Illustrative price comparison");
  await expect(attention).toContainText("No recall match is confirmed");
  const calendar = page.getByRole("region", {
    name: "Your care timeline",
    exact: true,
  });
  await expect(
    calendar.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible();
  await expect(calendar.locator("[data-care-calendar-event]")).toHaveCount(10);
  await expect
    .poll(async () => {
      const spacing = await calendar.evaluate((root) => {
        const studio = root.querySelector(
            '[data-testid="care-calendar-studio"]',
          )!,
          content = root.querySelector(".care-rail-content")!;
        return {
          gap:
            studio.getBoundingClientRect().height -
            content.getBoundingClientRect().height,
          row: parseFloat(getComputedStyle(document.documentElement).fontSize),
        };
      });
      return spacing.gap >= 0 && spacing.gap <= spacing.row + 1;
    })
    .toBe(true);
  const products = page.getByRole("region", {
    name: "All your products",
    exact: true,
  });
  await expect(products.locator("[data-care-product]")).toHaveCount(10);
  const journey = page.getByRole("region", {
    name: "How Pal Care works",
    exact: true,
  });
  const positions = await Promise.all(
    [help, attention, calendar, products, journey].map((el) =>
      el.boundingBox(),
    ),
  );
  for (let i = 1; i < positions.length; i++)
    expect(positions[i]!.y).toBeGreaterThan(positions[i - 1]!.y);
  await journey.getByText("Learn more", { exact: true }).click();
  await expect(
    journey.getByRole("link", {
      name: "Explore the PayPal Sandbox shop",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    journey.getByRole("link", { name: "AG Studio Insights", exact: true }),
  ).toHaveAttribute("href", "/insights");
  await expect(journey).not.toContainText("Watch video");
  await help.getByText("Prices & refunds", { exact: true }).click();
  const prices = help.locator("details").filter({
    has: page.locator("summary").filter({ hasText: "Prices & refunds" }),
  });
  await prices
    .getByRole("link")
    .filter({ hasText: "Everyday headphones" })
    .click();
  await expect(page).toHaveURL(
    /\/vault\/00000000-0000-4000-8000-000000000201\?milestone=price$/,
  );
  await expect(page.getByRole("dialog")).toContainText("$20.00");
  await page.goto("/dashboard");
  await help.getByText("Product safety", { exact: true }).click();
  await help
    .getByRole("link")
    .filter({ hasText: "Everywhere speaker" })
    .click();
  await expect(page).toHaveURL(/milestone=safety/);
  const safety = page.getByRole("dialog");
  await expect(safety).toContainText("No official recall match established");
  await safety
    .getByRole("link", { name: "Review safety sources", exact: true })
    .click();
  await expect(page).toHaveURL(/\/safety\?/);
  expect(
    await page.locator('a[href^="https://www.cpsc.gov/"]').count(),
  ).toBeGreaterThan(0);
  expect(writes).toEqual([]);
});

test("frozen demo calendar queries every saved sample event and opens the exact dated Twin/evidence", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const panel = page.getByRole("region", {
    name: "Your care timeline",
    exact: true,
  });
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await expect(panel).toHaveAttribute(
    "data-care-calendar-snapshot",
    "2026-11-10",
  );
  await expect(panel).toContainText("not a live forecast or verified coverage");
  await expect(panel.locator(".ag-studio-layout")).toBeVisible();
  // The vendor notice remains present and readable even in its fading state.
  await expect(panel.locator(".ag-studio-watermark")).toHaveCSS("opacity", "1");
  await expect(
    panel.getByRole("button", { name: /Today|Previous dates|Next dates/ }),
  ).toHaveCount(0);
  let links = panel.locator("[data-care-calendar-event]");
  expect(await links.count()).toBeGreaterThan(2);
  const exactIds = (await panel
    .locator("[data-care-calendar-engine]")
    .getAttribute("data-care-calendar-ids"))!.split("|");
  expect(
    await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-care-calendar-event")).sort(),
    ),
  ).toEqual(exactIds);
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
    /^\/vault\/[a-f0-9-]+\?milestone=(return-window|price|warranty|delivery|purchase)&careEvent=.+$/,
  );
  await links.first().click();
  await expect(page).toHaveURL(new RegExp(href!.replaceAll("?", "\\?")));
  await expect(page.getByRole("dialog")).toBeVisible();
  const factId = new URL(href!, "http://test.local").searchParams.get(
    "careEvent",
  )!;
  const selectedFact = page
    .getByRole("dialog")
    .locator(`[data-ownership-fact="${factId}"]`)
    .filter({ visible: true });
  await expect(selectedFact).toHaveCount(1);
  await expect(selectedFact).toBeVisible();
  await expect(selectedFact).toContainText(
    /Demo|Fictional sample event · not a current verified state/,
  );
  await expect(selectedFact.getByRole("link").first()).toBeVisible();
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

test("demo calendar wraps every event at 320px/200% text without hidden overflow and retains keyboard links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", {
    name: "Your care timeline",
    exact: true,
  });
  await expect(
    panel.locator('[data-care-calendar-engine="verified"]'),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const scroll = panel.getByRole("region", {
    name: "Example care timeline",
    exact: true,
  });
  const firstEvent = scroll.locator("[data-care-calendar-event]").first();
  await firstEvent.focus();
  await expect(firstEvent).toBeFocused();
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    false,
  );
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
  await expect(
    panel.getByRole("button", { name: /Today|Previous dates|Next dates/ }),
  ).toHaveCount(0);
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

test("demo calendar shows all events without nested swipe surfaces, native frames or vertical clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", {
    name: "Your care timeline",
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
  expect(horizontal).toEqual([]);
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
        .getByRole("heading", { level: 3 })
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
  await expect(
    page.locator(".customer-demo-disclosure .demo-details"),
  ).toHaveCount(1);
  await expect(page.locator(".customer-demo-disclosure summary")).toContainText(
    "Example purchases & PayPal Sandbox",
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
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (cutoff(deadline)) {
      await expect(dialog).toContainText(
        suffix === "202" ? "Delivery unconfirmed" : "Window ended",
      );
      await expect(dialog).not.toContainText("days remaining");
    }
    await expect(dialog).toContainText(
      suffix === "202"
        ? /No live tracking or confirmed arrival/i
        : /Seller acceptance.*Not confirmed/i,
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
    "paid price is missing, so eligibility is unverified",
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
    ["201", "Compare saved prices", "Headphones price comparison", "$20.00"],
    [
      "206",
      "View return progress",
      "Boots return progress",
      "Inspection pending",
    ],
    [
      "208",
      "View refund details",
      "Book refund example",
      "No PayPal refund was issued",
    ],
  ]) {
    const card = page.locator(
      `[data-care-product="00000000-0000-4000-8000-000000000${suffix}"]`,
    );
    await card.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: heading, exact: true });
    await expect(dialog).toContainText("Illustrative");
    await expect(
      dialog.locator('[data-document-presentation="validated"]:visible'),
    ).toBeVisible();
    await expect(dialog).toContainText(evidence);
    await expect(
      dialog.getByRole("link", { name: heading, exact: true }),
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
    main.getByRole("region", { name: "Your products", exact: true }),
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
  await expect(main).toContainText("Example purchases & PayPal Sandbox");
  // Compare the same layout frame. Independent browser round trips can straddle
  // a shared calendar/heading resize and falsely report unequal row positions.
  const [first, second] = await cards.evaluateAll((nodes) =>
    nodes.slice(0, 2).map((node) => {
      const rect = node.getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    }),
  );
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
    name: "Purchase price and retailer comparison",
  });
  await expect(prices).toContainText("$1,199.00");
  await expect(prices).toContainText("$1,099.00");
  await expect(prices).toContainText(
    "Matching model and variant reference — not proof of ownership",
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
    name: "Purchase price and retailer comparison",
  });
  await expect(prices).toContainText("not a $0 purchase");
  await expect(prices).toContainText("$175.00");
  await expect(prices).toContainText("no difference was calculated");
  await page.goto("/vault/00000000-0000-4000-8000-000000000208");
  prices = page.getByRole("region", {
    name: "Purchase price and retailer comparison",
  });
  await expect(prices).toContainText("$24.95");
  await expect(prices).toContainText("$21.99");
  await expect(prices).toContainText(
    "Similar product — not confirmed identical",
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
