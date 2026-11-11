import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const kettle = "00000000-0000-4000-8000-000000000202";
const headphones = "00000000-0000-4000-8000-000000000201";
const receipt = "00000000-0000-4000-8000-000000000302";
const north = (page: Page) =>
  page.getByRole("dialog", { name: "North Star", exact: true });
const field = (page: Page) =>
  page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });

for (const route of ["/dashboard", "/purchases", "/documents", "/insights"]) {
  test(`shared top and floating North launchers stay clear on ${route} while scrolling without dispatching`, async ({
    page,
  }) => {
    const writes: string[] = [];
    await page.route("**/api/**", async (route) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
        writes.push(new URL(route.request().url()).pathname);
        return route.abort();
      }
      return route.continue();
    });
    const top = page.getByRole("button", {
      name: "Explore with North Star",
      exact: true,
    });
    const floating = page.getByRole("button", {
      name: "Open North Star",
      exact: true,
    });
    const expectClearCorner = async () => {
      await expect
        .poll(() =>
          page.locator(".north-floating-launcher").evaluate((node) => {
            // A densely packed mobile surface may make the lower corner yield;
            // a hidden, noninteractive icon cannot obscure its controls/text.
            if (getComputedStyle(node).visibility === "hidden") return [];
            const box = node.getBoundingClientRect();
            return [
              ...document.querySelectorAll<HTMLElement>(
                'a, button, input, textarea, select, summary, [role="button"], [role="tab"]',
              ),
            ]
              .filter(
                (element) =>
                  element !== node &&
                  !node.contains(element) &&
                  getComputedStyle(element).visibility !== "hidden",
              )
              .filter((element) => {
                const r = element.getBoundingClientRect();
                return (
                  r.width > 0 &&
                  r.height > 0 &&
                  r.left < box.right &&
                  r.right > box.left &&
                  r.top < box.bottom &&
                  r.bottom > box.top
                );
              })
              .map(
                (element) =>
                  element.getAttribute("aria-label") ??
                  element.textContent?.trim(),
              );
          }),
        )
        .toEqual([]);
    };
    await page.goto(route);
    await expect(field(page)).toHaveCount(0);
    await expect(
      page.locator("[data-north-search], #library-search"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ask North Star", exact: true }),
    ).toHaveCount(0);
    await expect(top).toHaveCount(1);
    await expect(top).toBeVisible();
    // Dense tablet collections may legitimately yield the corner icon. Keep its
    // DOM identity/collision contract, then exercise it in real clear footer space.
    const floatingNode = page.locator(".north-floating-launcher");
    await expect(floatingNode).toHaveCount(1);
    await expectClearCorner();
    await top.click();
    const composer = north(page).getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    });
    await composer.fill(`Keep the unsent ${route} question`);
    await north(page)
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
    await page.locator("footer").last().scrollIntoViewIfNeeded();
    await expect(floating).toBeVisible();
    await floating.click();
    await expect(composer).toHaveValue(`Keep the unsent ${route} question`);
    await north(page)
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
    await page.evaluate(() => scrollTo(0, 0));
    if (route === "/insights") {
      const studio = page.getByTestId("customer-studio");
      await expect(studio.getByRole("grid")).toBeVisible({ timeout: 20000 });
      await expect(
        studio.locator(".ag-studio-layout-widget-loading-overlay-active"),
      ).toHaveCount(0);
    }
    const header = await page.locator(".customer-header").boundingBox();
    const button = await top.boundingBox();
    const main = await page.getByRole("main").boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(button!.x + button!.width).toBeCloseTo(
      main!.x +
        main!.width -
        (await page.evaluate(() =>
          parseFloat(
            getComputedStyle(document.querySelector("main")!).paddingRight,
          ),
        )),
      0,
    );
    const fixed = await floatingNode.boundingBox();
    expect(fixed!.width).toBeGreaterThanOrEqual(44);
    expect(fixed!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => scrollTo(0, innerHeight / 2));
    await expectClearCorner();
    if (route === "/dashboard") {
      await expect(
        page.locator('[data-care-calendar-engine="verified"]'),
      ).toBeVisible();
      // Reproduce an async section reflow after scrolling, with unchanged main
      // dimensions: the original main-only ResizeObserver missed this case.
      await page.evaluate(() => {
        const link = document.querySelector<HTMLAnchorElement>(
          'main a[href="/purchases"]',
        )!;
        scrollTo(
          0,
          scrollY + link.getBoundingClientRect().top - innerHeight * 0.35,
        );
      });
      await expectClearCorner();
      const reflow = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        const calendar = main.querySelector<HTMLElement>(
          "[data-care-calendar-range]",
        )!;
        const link = main.querySelector<HTMLAnchorElement>(
          'a[href="/purchases"]',
        )!;
        const products = link.closest("section")!;
        const launcher = document.querySelector(".north-floating-launcher")!;
        const height = main.getBoundingClientRect().height;
        const delta =
          launcher.getBoundingClientRect().top -
          link.getBoundingClientRect().top;
        calendar.style.paddingBottom = `${parseFloat(getComputedStyle(calendar).paddingBottom) + delta}px`;
        products.style.marginBottom = `${parseFloat(getComputedStyle(products).marginBottom) - delta}px`;
        return {
          delta,
          before: height,
          after: main.getBoundingClientRect().height,
        };
      });
      expect(reflow.delta).toBeGreaterThan(0);
      expect(reflow.after).toBeCloseTo(reflow.before, 0);
      await expectClearCorner();
    }
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(floating).toHaveCSS("position", "fixed");
    await expect(floating).toBeVisible();
    await expectClearCorner();
    // Chart initialization can increase document height after a scroll. Read
    // back the actual footer action, not an earlier document-height estimate.
    const about = page
      .locator("footer")
      .last()
      .getByRole("link", { name: "About Pal Care", exact: true });
    await about.scrollIntoViewIfNeeded();
    await expect(about).toBeInViewport();
    await expectClearCorner();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation", exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test("shared top and floating North launchers preserve one panel, drafts and history without moving the page or dispatching", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      writes.push(new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.continue();
  });
  const top = page.getByRole("button", {
    name: "Explore with North Star",
    exact: true,
  });
  const floating = page.getByRole("button", {
    name: "Open North Star",
    exact: true,
  });
  await page.goto("/purchases");
  await page.locator("footer").last().scrollIntoViewIfNeeded();
  await expect(floating).toBeVisible();
  const geometry = () =>
    page.evaluate(() => ({
      scroll: scrollY,
      width: document.querySelector("main")!.getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
    }));
  const before = await geometry();
  await floating.click();
  await expect(north(page)).toHaveCount(1);
  await expect(floating).toHaveCount(0);
  expect(await geometry()).toEqual(before);
  await north(page)
    .getByRole("button", { name: "New chat", exact: true })
    .click();
  const composer = north(page).getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await composer.fill("Keep this shared unsent draft");
  const chat = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("palcare-north-chats-v1")!)
        .activeChatId,
  );
  await north(page)
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await expect(floating).toBeFocused();
  await top.scrollIntoViewIfNeeded();
  const atTop = await geometry();
  await top.click();
  await expect(north(page)).toHaveCount(1);
  await expect(composer).toHaveValue("Keep this shared unsent draft");
  expect(await geometry()).toEqual(atTop);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("palcare-north-chats-v1")!)
          .activeChatId,
    ),
  ).toBe(chat);
  await north(page)
    .getByRole("button", { name: "Previous chats", exact: true })
    .click();
  await expect(
    north(page).getByRole("region", { name: "Previous chats", exact: true }),
  ).toBeVisible();
  await north(page)
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page.locator("footer").last().scrollIntoViewIfNeeded();
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(
    north(page).getByRole("region", { name: "Previous chats", exact: true }),
  ).toBeVisible();
  await north(page)
    .getByRole("button", { name: "Minimize North Star", exact: true })
    .click();
  await expect(floating).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Restore North Star", exact: true }),
  ).toHaveCount(1);
  expect(writes).toEqual([]);
});

for (const kind of ["care", "records", "Insights"] as const) {
  test(`closed Home admission preserves an uncertain ${kind} envelope before any new conversational POST`, async ({
    page,
  }) => {
    const originalId = "00000000-0000-4000-8000-000000009801";
    const conversationId = "00000000-0000-4000-8000-000000009802";
    const key =
      kind === "Insights"
        ? "palcare-insights-pending-v1"
        : kind === "records"
          ? "palcare-records-pending-v1"
          : "palcare-careos-pending-v1";
    await page.addInitScript(
      ({ key, kind, originalId, conversationId }) => {
        if (sessionStorage.getItem("north-closed-admission-seeded")) return;
        sessionStorage.setItem("north-closed-admission-seeded", "yes");
        const message =
            "Original dispatched question with an unconfirmed result",
          createdAt = Date.now();
        const pending =
          kind === "Insights"
            ? { requestId: originalId, conversationId, message, createdAt }
            : {
                input: {
                  requestId: originalId,
                  twinId: null,
                  revision: 0,
                  message,
                },
                context: null,
                conversationId,
                createdAt,
              };
        sessionStorage.setItem(key, JSON.stringify(pending));
        sessionStorage.setItem(
          "palcare-north-workspace-v1",
          JSON.stringify({
            version: 1,
            id: null,
            open: false,
            historySelected: false,
          }),
        );
        sessionStorage.setItem(
          "palcare-careos-interaction-v1",
          JSON.stringify({
            version: 1,
            context: null,
            explicit: false,
            draft: "Keep this new question unsent",
            savedAt: Date.now(),
          }),
        );
      },
      { key, kind, originalId, conversationId },
    );
    const posts: string[] = [];
    await page.route(
      /\/api\/(?:careos\/(?:records\/)?conversations|intelligence\/customer\/plan)/,
      async (route) => {
        const request = route.request();
        if (request.method() === "POST") {
          posts.push(new URL(request.url()).pathname);
          await route.fulfill({
            status: 503,
            json: { error: "injected_new_dispatch_forbidden" },
          });
          return;
        }
        if (kind === "Insights" && request.url().includes("/intelligence/")) {
          await route.fulfill({
            status: 503,
            json: { error: "injected_original_still_unknown" },
          });
          return;
        }
        await route.fulfill({
          json: {
            id: conversationId,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            turns: [],
          },
        });
      },
    );
    await page.goto("/purchases");
    await expect(field(page)).toHaveCount(0);
    await expect(north(page)).toHaveCount(0);
    const envelope = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      key,
    );
    await page
      .getByRole("button", { name: "Explore with North Star", exact: true })
      .click();
    await expect(north(page)).toBeVisible();
    expect(posts).toEqual([]);
    await expect(
      north(page).locator("[data-pending-question]"),
    ).toHaveAttribute("data-request-id", originalId);
    await expect(
      north(page).getByRole("textbox", {
        name: "Ask about your purchases",
        exact: true,
      }),
    ).toHaveValue("Keep this new question unsent");
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(
      envelope,
    );
    await north(page)
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Explore with North Star",
        exact: true,
      }),
    ).toBeFocused();
    await page.getByText("Filters & sort", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("Audio");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/purchases" &&
        url.searchParams.get("category") === "Audio",
    );
    expect(posts).toEqual([]);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(
      envelope,
    );
  });
}
async function ask(page: Page, message: string) {
  const panel = north(page);
  await panel
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill(message);
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/conversations\/.+\/(turns|interpret)$/.test(new URL(r.url()).pathname),
  );
  await panel
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const turn = await result.json();
  await expect(
    panel.locator(`[data-request-id="${turn.requestId}"]`),
  ).toBeVisible();
  await expect(panel.locator("[data-pending-question]")).toHaveCount(0);
  return turn;
}

test("calm collection has only shared North launchers, collapsed filters and reachable product details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/purchases");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your products",
  );
  await expect(
    page.getByText("Everything you own, all cared for.", { exact: true }),
  ).toBeVisible();
  await expect(field(page)).toHaveCount(0);
  await expect(page.locator("[data-north-search]")).toHaveCount(0);
  await expect(page.locator(".careos-launcher")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link"),
  ).toHaveText(["Care", "Purchases & Docs", "Insights"]);
  await expect(
    page.getByRole("combobox", { name: "Category", exact: true }),
  ).not.toBeVisible();
  // The approved shared header action now occupies this first-screen slot.
  // Keep its original 664px budget and separately prove direct purchase access.
  const launcher = page.getByRole("button", {
    name: "Explore with North Star",
    exact: true,
  });
  const box = await launcher.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(664);
  const firstPurchase = page
    .locator("[data-purchase-card] .library-product-link")
    .first();
  await expect(firstPurchase).toHaveAttribute(
    "href",
    /^\/vault\/[a-f0-9-]{36}$/,
  );
  await firstPurchase.scrollIntoViewIfNeeded();
  await expect(firstPurchase).toBeInViewport();
  await page.getByText("Filters & sort", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Audio");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("purchase");
  await expect(page.locator("[data-purchase-card]")).toHaveCount(2);
  expect(writes).toEqual([]);
});

test("receipt → totals → Audio → native chart → exact product care → previous result stays connected", async ({
  page,
}) => {
  test.setTimeout(90000);
  const posts: string[] = [],
    financial: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") {
      posts.push(new URL(r.url()).pathname);
      if (
        /^\/api\/(checkout|operator|guardian)/.test(new URL(r.url()).pathname)
      )
        financial.push(r.url());
    }
  });
  // A deliberate contextual selection supplies fixture-mode identity. This run
  // tests real local tools/UI, NOT genuine model understanding; HTTPS does that.
  await page.goto(`/vault/${kettle}`);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  await north(page)
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Purchases & Docs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await ask(page, "Find receipt");
  // The narrow assistant links to the unchanged full record instead of
  // embedding the document reader. Verify the original through a read only.
  await expect(
    north(page).getByLabel("Document contents", { exact: true }),
  ).toHaveCount(0);
  const originalReceipt = await page.request.get(`/documents/${receipt}`);
  expect(originalReceipt.ok()).toBe(true);
  expect(await originalReceipt.text()).toContain(
    "Example receipt. No payment was processed.",
  );
  await expect(
    north(page).locator("[data-native-north-result]").getByRole("link", {
      name: "View full receipt or document",
      exact: true,
    }),
  ).toHaveAttribute("href", `/documents/${receipt}`);
  const panel = north(page);
  await expect(
    panel.getByRole("link", {
      name: "View full receipt or document",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"][aria-label="North Star"]')
        .withRules(["heading-order"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(await panel.evaluate((element) => !!element.closest("main"))).toBe(
    false,
  );
  expect(
    await panel.evaluate((element) => getComputedStyle(element).position),
  ).toBe("fixed");
  await expect(panel).toHaveAttribute("aria-modal", "false");
  const totals = await ask(page, "Show all my purchases and totals");
  expect(totals.answer.recordsResult.records).toHaveLength(4);
  expect(
    totals.answer.recordsResult.totals.find(
      (v: { origin: string }) => v.origin === "sample",
    ).amountMinor,
  ).toBe(30700);
  expect(
    totals.answer.recordsResult.totals.find(
      (v: { origin: string }) => v.origin === "sandbox",
    ).amountMinor,
  ).toBe(0);
  const audio = await ask(page, "Only Audio");
  expect(audio.answer.recordsResult.records).toHaveLength(2);
  expect(
    audio.answer.recordsResult.records.every(
      (r: { category: string }) => r.category === "Audio",
    ),
  ).toBe(true);
  const chart = await ask(page, "Show that as a chart");
  expect(chart.answer.recordsResult.records).toHaveLength(2);
  await expect(page).toHaveURL(/\/insights$/);
  await expect(panel.getByRole("status")).toContainText(
    "The chart, separate USD totals, filters and matching purchases were checked",
    { timeout: 25000 },
  );
  await expect(
    page.getByTestId("customer-studio").getByRole("figure").last(),
  ).toBeInViewport();
  await panel.locator(`a[href="/vault/${headphones}"]`).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday headphones",
  );
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const care = await ask(page, "Product care");
  expect(care.answer.context.twinId).toBe(headphones);
  await expect(panel).toContainText(/manual|care|guidance/i);
  const before = posts.length;
  await panel
    .getByRole("button", { name: "Previous result", exact: true })
    .click();
  await expect(
    panel.locator(`[data-request-id="${chart.requestId}"]`),
  ).toBeVisible();
  await expect(
    panel.locator("[data-native-north-result] [data-records-result]"),
  ).toContainText("Audio");
  expect(posts).toHaveLength(before);
  expect(financial).toEqual([]);
});

test("History selection anchors a new follow-up to the selected owned result, not a later category", async ({
  page,
}) => {
  await page.goto("/purchases");
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await ask(page, "Show all my purchases");
  const audio = await ask(page, "Only Audio");
  const kitchen = await ask(page, "Show all Kitchen purchases");
  expect(
    kitchen.answer.recordsResult.records.map(
      (r: { category: string }) => r.category,
    ),
  ).toEqual(["Kitchen"]);
  await north(page)
    .getByRole("button", { name: "History", exact: true })
    .click();
  await north(page)
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: "Only Audio", exact: true })
    .click();
  await expect(
    north(page).locator(`[data-request-id="${audio.requestId}"]`),
  ).toBeVisible();
  await page.reload();
  await expect(
    north(page).locator(`[data-request-id="${audio.requestId}"]`),
  ).toBeVisible();
  const anchoredRequest = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      /\/(turns|interpret)$/.test(new URL(r.url()).pathname) &&
      r.postDataJSON().message === "Show those as bullet points",
  );
  const bullets = await ask(page, "Show those as bullet points");
  expect((await anchoredRequest).postDataJSON().followupRequestId).toBe(
    audio.requestId,
  );
  expect(
    bullets.answer.recordsResult.records.every(
      (r: { category: string }) => r.category === "Audio",
    ),
  ).toBe(true);
  expect(bullets.answer.recordsResult.query.format).toBe("bullets");
  await expect(
    north(page).locator("[data-native-north-result]").getByRole("list", {
      name: "Matching saved purchases",
      exact: true,
    }),
  ).toHaveClass(/list-disc/);
});

test("floating results, draft and owned History survive reload without automatic turn or chart replay", async ({
  page,
}) => {
  await page.goto("/purchases");
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  const turn = await ask(page, "Show all my purchases");
  await north(page)
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("Keep this follow-up draft");
  const forbidden: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/(turns|interpret|plan)$/.test(new URL(r.url()).pathname)
    )
      forbidden.push(r.url());
  });
  await page.reload();
  await expect(
    north(page).locator(`[data-request-id="${turn.requestId}"]`),
  ).toBeVisible();
  await expect(
    north(page).getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
  ).toHaveValue("Keep this follow-up draft");
  expect(
    await north(page).evaluate((element) => getComputedStyle(element).position),
  ).toBe("fixed");
  expect(forbidden).toEqual([]);
});

test("explicit purchase B remains authoritative after reload while result A stays inspectable", async ({
  page,
}) => {
  await page.goto(`/vault/${headphones}`);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const answerA = await ask(page, "Find receipt");
  expect(answerA.answer.context.twinId).toBe(headphones);
  // Select A through History, then explicitly replace only the follow-up pin.
  await north(page)
    .getByRole("button", { name: "History", exact: true })
    .click();
  await north(page)
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: "Find receipt", exact: true })
    .click();
  await north(page)
    .getByRole("button", { name: "Choose purchase", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a purchase", exact: true })
    .getByRole("button", { name: /Pour-over kettle/ })
    .click();
  await expect(
    north(page).getByRole("region", {
      name: "Persistent purchase context",
      exact: true,
    }),
  ).toContainText("Pour-over kettle");
  await expect(
    north(page).locator(`[data-request-id="${answerA.requestId}"]`),
  ).toBeVisible();
  const replay: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/(turns|interpret|plan)$/.test(new URL(r.url()).pathname)
    )
      replay.push(r.url());
  });
  await page.reload();
  await expect(
    north(page).locator(`[data-request-id="${answerA.requestId}"]`),
  ).toBeVisible();
  await expect(
    north(page).getByRole("region", {
      name: "Persistent purchase context",
      exact: true,
    }),
  ).toContainText("Pour-over kettle");
  expect(replay).toEqual([]);
  const request = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      /\/(turns|interpret)$/.test(new URL(r.url()).pathname),
  );
  const answerB = await ask(page, "Show this product’s receipt");
  expect((await request).postDataJSON().twinId).toBe(kettle);
  expect(answerB.answer.context.twinId).toBe(kettle);
  await expect(
    north(page).locator("[data-native-north-result]").getByRole("link", {
      name: "View full receipt or document",
      exact: true,
    }),
  ).toHaveAttribute("href", `/documents/${receipt}`);
  await north(page)
    .getByRole("button", { name: "Previous result", exact: true })
    .click();
  await expect(
    north(page).locator(`[data-request-id="${answerA.requestId}"]`),
  ).toBeVisible();
  await expect(
    north(page).getByRole("link", {
      name: "View full receipt or document",
      exact: true,
    }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000301");
  expect(replay).toHaveLength(1);
});

test("ordinary result lists and controls reflow at 320px and 200% text without a focus trap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/purchases");
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your products",
  );
  await expect(
    north(page).getByRole("heading", {
      name: "Hi! I’m North ☆",
      exact: true,
    }),
  ).toBeVisible();
  await expect(field(page)).toHaveCount(0);
  await expect(page.locator("[data-purchase-card]")).toHaveCount(4);
  await ask(page, "Show all my purchases");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  const composer = north(page).getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await composer.focus();
  await expect(composer).toBeFocused();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Purchases & Docs", exact: true })
    .focus();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Purchases & Docs", exact: true }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("secondary customer pages preserve the same floating North across navigation without financial dispatch", async ({
  page,
}) => {
  const prohibited: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /^\/api\/(checkout|operator|guardian|paypal|payments)/.test(
        new URL(r.url()).pathname,
      )
    )
      prohibited.push(r.url());
  });
  await page.goto("/shop");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .locator('[aria-current="page"]'),
  ).toHaveText("Care");
  await expect(page.getByText("More tools", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await expect(north(page)).toBeVisible();
  expect(
    await north(page).evaluate(
      (node) =>
        !node.closest("main") && getComputedStyle(node).position === "fixed",
    ),
  ).toBe(true);
  await north(page)
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("Keep this secondary-page draft");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Purchases & Docs", exact: true })
    .click();
  await expect(north(page)).toBeVisible();
  await expect(field(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your products",
  );
  await expect(page.locator("[data-purchase-card]")).toHaveCount(4);
  await expect(
    north(page).getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
  ).toHaveValue("Keep this secondary-page draft");
  expect(prohibited).toEqual([]);
});

test("library filters remain provider-free during a pending answer and late chart work cannot hijack them", async ({
  page,
}) => {
  await page.goto("/purchases");
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await ask(page, "Show all my purchases");
  let release!: () => void, signalHeld!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = new Promise<void>((resolve) => {
    signalHeld = resolve;
  });
  await page.route(
    /\/api\/careos\/records\/conversations\/.+\/turns$/,
    async (route) => {
      const response = await route.fetch();
      signalHeld();
      await gate;
      await route.fulfill({ response });
    },
  );
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/records\/conversations\/.+\/turns$/.test(new URL(r.url()).pathname),
  );
  try {
    await north(page)
      .getByRole("textbox", { name: "Ask about your purchases", exact: true })
      .fill("Show that as a chart");
    await north(page)
      .getByRole("button", { name: "Send to North Star", exact: true })
      .click();
    await held;
    await page.getByText("Filters & sort", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("Audio");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/purchases" &&
        url.searchParams.get("category") === "Audio",
    );
    await expect(page.locator("[data-purchase-card]")).toHaveCount(2);
    release();
    const response = await saved;
    expect(response.ok()).toBe(true);
    const turn = await response.json();
    await north(page)
      .locator("header")
      .getByRole("button", { name: "History", exact: true })
      .click();
    await north(page)
      .getByRole("region", { name: "Previous North results", exact: true })
      .getByRole("button", { name: "Show that as a chart", exact: true })
      .click();
    await expect(
      north(page).locator(`[data-request-id="${turn.requestId}"]`),
    ).toBeVisible();
    await expect(north(page).getByRole("status")).not.toContainText(
      "The chart, separate USD totals, filters and matching purchases were checked",
    );
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/purchases" &&
        url.searchParams.get("category") === "Audio",
    );
    await expect(page.getByTestId("customer-studio")).toHaveCount(0);
  } finally {
    release();
  }
});
