import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { CareTurn } from "../../src/lib/careos/contracts";

test.describe.configure({ timeout: 60_000 });
async function open(page: Page) {
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Working… your next draft is kept.", { exact: true }),
  ).toHaveCount(0);
  return dialog;
}
async function ask(page: Page, message: string) {
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await dialog
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill(message);
  const response = page.waitForResponse(
    (r) =>
      /\/api\/careos\/records\/conversations\/[^/]+\/turns$/.test(
        new URL(r.url()).pathname,
      ) && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const turn = (await result.json()) as CareTurn;
  await expect(
    dialog.locator(`[data-request-id="${turn.requestId}"]`),
  ).toBeVisible();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  return {
    turn,
    article: dialog.locator(`[data-request-id="${turn.requestId}"]`),
  };
}

test("actual saved records → bullets → totals → category/date follow-up retains exact snapshots and no model transport", async ({
  page,
}) => {
  const errors: string[] = [];
  const prohibited: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (
      u.origin !== new URL(test.info().project.use.baseURL!).origin ||
      /^\/api\/(checkout|operator|intelligence)/.test(u.pathname) ||
      (/\/api\/careos\/conversations\/.+\/turns$/.test(u.pathname) &&
        r.method() === "POST")
    ) {
      prohibited.push(`${r.method()} ${u.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/dashboard");
  const dialog = await open(page);
  const first = await ask(page, "Show my purchases");
  expect(first.turn.answer.recordsResult?.records).toHaveLength(4);
  const list = await ask(page, "Put those in a list");
  expect(list.turn.answer.recordsResult?.snapshotId).toBe(
    first.turn.answer.recordsResult?.snapshotId,
  );
  await expect(
    list.article.getByRole("list", { name: "Matching saved purchases" }),
  ).toHaveClass(/list-disc/);
  await expect(
    list.article
      .getByRole("list", { name: "Matching saved purchases" })
      .getByRole("listitem"),
  ).toHaveCount(4);
  const total = await ask(page, "What is the recorded total for those?");
  expect(total.turn.answer.recordsResult?.snapshotId).toBe(
    first.turn.answer.recordsResult?.snapshotId,
  );
  await expect(total.article).toContainText("$307.00");
  await expect(total.article).toContainText(
    "3 priced · 1 unpriced/reference excluded",
  );
  await expect(total.article).toContainText("Verified Sandbox purchase value");
  const electronics = await ask(page, "Only electronics");
  expect(electronics.turn.answer.recordsResult?.records).toHaveLength(3);
  expect(electronics.turn.answer.recordsResult?.totals[0].amountMinor).toBe(
    21800,
  );
  const period = await ask(page, "What about last month?");
  expect(period.turn.answer.recordsResult?.query.categories).toEqual([
    "Audio",
    "Computing",
  ]);
  expect(period.turn.answer.recordsResult?.query.from).toMatch(/-01$/);
  await expect(dialog).toBeVisible();
  expect(prohibited).toEqual([]);
  expect(errors).toEqual([]);
  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(axe.violations).toEqual([]);
});

test("comparison plus table retrieves prior-period evidence; a plain total keeps the selection without a stale comparison panel", async ({
  page,
}) => {
  // A separate short scenario respects the real six-turn/minute owner guard;
  // neither quota nor conversation cookies are reset inside a scenario.
  await page.goto("/dashboard");
  await open(page);
  const first = await ask(
    page,
    "Show my purchases in electronics from 2026-10-01 to 2026-10-31",
  );
  const comparison = await ask(
    page,
    "Put those results in a table and compare with the previous period",
  );
  expect(first.turn.answer.recordsResult?.comparison).toBeNull();
  expect(comparison.turn.answer.recordsResult?.comparison).toMatchObject({
    from: "2026-09-01",
    to: "2026-09-30",
    records: [],
  });
  await expect(comparison.article).toContainText("Previous period:");
  const plainTotal = await ask(page, "Total?");
  expect(plainTotal.turn.answer.recordsResult?.snapshotId).toBe(
    comparison.turn.answer.recordsResult?.snapshotId,
  );
  expect(plainTotal.turn.answer.recordsResult?.comparison).toBeNull();
  await expect(plainTotal.article).not.toContainText("Previous period:");
  await expect(plainTotal.article).toContainText("$218.00");
});

test("leaving before a chart response keeps the late saved answer without reopening Insights or replaying its action", async ({
  page,
}, info) => {
  let signalHeld!: () => void;
  const held = new Promise<void>((resolve) => {
    signalHeld = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const message = "Show that by category as a chart";
  await page.route(
    "**/api/careos/records/conversations/*/turns",
    async (route) => {
      if (route.request().postDataJSON().message !== message)
        return route.continue();
      const response = await route.fetch();
      signalHeld();
      await gate;
      await route.fulfill({ response });
    },
  );
  try {
    await page.goto("/dashboard");
    const dialog = await open(page);
    await ask(page, "Show my purchases");
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/records\/conversations\/.+\/turns$/.test(
          new URL(r.url()).pathname,
        ) &&
        r.request().postDataJSON().message === message,
    );
    await dialog
      .getByRole("textbox", { name: "Ask about your purchases", exact: true })
      .fill(message);
    await dialog
      .getByRole("button", { name: "Send to North Star", exact: true })
      .click();
    await held;
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    const nav = page.getByRole("navigation", {
      name:
        (info.project.use.viewport?.width ?? 1440) < 1024
          ? "Mobile navigation"
          : "Main navigation",
      exact: true,
    });
    await nav
      .getByRole("link", { name: "Documents", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/\/documents$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your paperwork, together.",
        exact: true,
      }),
    ).toBeVisible();
    const unexpectedInsights: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url()),
        headers = request.headers();
      if (
        url.pathname === "/insights" &&
        headers["next-router-prefetch"] !== "1" &&
        headers.purpose !== "prefetch"
      )
        unexpectedInsights.push(url.pathname);
    });
    release();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    const turn = (await saved.json()) as CareTurn;
    await open(page);
    const article = dialog.locator(`[data-request-id="${turn.requestId}"]`);
    await expect(article.locator("[data-records-result]")).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page).toHaveURL(/\/documents$/);
    await expect(article.getByRole("status")).toContainText(
      "not yet confirmed",
    );
    await expect(page.getByTestId("customer-studio")).toHaveCount(0);
    expect(unexpectedInsights).toEqual([]);
  } finally {
    release();
  }
});

test("records remain available with private AI endpoints denied; owned cookies cannot read each other's histories", async ({
  page,
  context,
}) => {
  await page.route("**/api/careos/conversations**", (r) =>
    r.fulfill({ status: 403, json: { error: "careos_owner_signin_required" } }),
  );
  await page.goto("/dashboard");
  await open(page);
  const result = await ask(page, "Find purchases with receipts");
  expect(
    result.turn.answer.recordsResult?.records.map((r) => r.receiptId),
  ).toEqual(
    expect.arrayContaining([
      "00000000-0000-4000-8000-000000000301",
      "00000000-0000-4000-8000-000000000302",
    ]),
  );
  const recordsId = await page.evaluate(() =>
    sessionStorage.getItem("palcare-records-conversation-v1"),
  );
  expect(recordsId).toBeTruthy();
  // A provider-free records cookie cannot authorize semantic-model dispatch.
  const deniedInterpretation = await context.request.post(
    `/api/careos/records/conversations/${recordsId}/interpret`,
    {
      headers: { Origin: test.info().project.use.baseURL! },
      data: {
        requestId: crypto.randomUUID(),
        twinId: null,
        revision: 0,
        message: "Which purchases absorbed the audio budget?",
      },
    },
  );
  expect(deniedInterpretation.status()).toBe(403);
  const other = await context
    .browser()!
    .newContext({ baseURL: test.info().project.use.baseURL });
  try {
    expect(
      (
        await other.request.get(
          `/api/careos/records/conversations/${recordsId}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await context.request.post(
          `/api/careos/records/conversations/${recordsId}/turns`,
          {
            headers: { Origin: "https://wrong.example" },
            data: {
              requestId: crypto.randomUUID(),
              twinId: null,
              revision: 0,
              message: "Show my purchases",
            },
          },
        )
      ).status(),
    ).toBe(403);
  } finally {
    await other.close();
  }
});

test("record timeline and draft restore by owned GET after reload and navigation without turn replay", async ({
  page,
}) => {
  await page.goto("/dashboard");
  let dialog = await open(page);
  const first = await ask(page, "Show my purchases");
  const composer = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await composer.fill("Keep this draft");
  let turnPosts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/turns$/.test(new URL(r.url()).pathname))
      turnPosts++;
  });
  await page.reload();
  dialog = await open(page);
  await expect(
    dialog.locator(`[data-request-id="${first.turn.requestId}"]`),
  ).toBeVisible();
  await expect(
    dialog.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
  ).toHaveValue("Keep this draft");
  expect(turnPosts).toBe(0);
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page.goto("/documents");
  dialog = await open(page);
  await expect(
    dialog.locator(`[data-request-id="${first.turn.requestId}"]`),
  ).toBeVisible();
  expect(turnPosts).toBe(0);
});

test("saved totals apply a real native chart and provenance KPIs, then exact product care returns to the same conversation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/insights");
  await expect(page.getByTestId("insight-documents-care")).toBeVisible({
    timeout: 20000,
  });
  let dialog = await open(page);
  await ask(page, "Show my purchases");
  const totals = await ask(page, "What is the recorded total for those?");
  await expect(
    totals.article.getByRole("button", {
      name: "Show native chart",
      exact: true,
    }),
  ).toBeVisible();
  await totals.article
    .getByRole("button", { name: "Show native chart", exact: true })
    .click();
  await expect(totals.article.getByRole("status")).toContainText(
    "executed and verified",
    { timeout: 15000 },
  );
  const studio = page.getByTestId("customer-studio");
  const wrappers = studio.locator(".ag-studio-layout-widget");
  const sample = wrappers.filter({
    has: page.locator(".ag-studio-layout-widget-title", {
      hasText: /^Sample purchase value \(USD\)$/,
    }),
  });
  await expect(sample.locator(".ag-studio-value-widget-content")).toContainText(
    "307",
  );
  await expect(
    wrappers
      .filter({
        has: page.locator(".ag-studio-layout-widget-title", {
          hasText: /^Verified Sandbox purchase value \(USD\)$/,
        }),
      })
      .locator(".ag-studio-value-widget-content"),
  ).toContainText("0");
  await expect(
    wrappers
      .filter({
        has: page.locator(".ag-studio-layout-widget-title", {
          hasText: /^Recorded value \(USD\)$/,
        }),
      })
      .locator("canvas")
      .first(),
  ).toBeVisible();
  const pi = totals.article.getByRole("link", {
    name: "Raspberry Pi 5 · 5",
    exact: true,
  });
  await pi.click();
  await expect(page).toHaveURL(
    /\/vault\/00000000-0000-4000-8000-000000000204$/,
  );
  if (!(await dialog.isVisible())) dialog = await open(page);
  await expect(dialog.locator(".careos-context")).toContainText(
    "Raspberry Pi 5",
  );
  await dialog
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("How do I shut down my Pi?");
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(dialog.locator("[data-latest-answer]")).toContainText(
    /Shutdown|shut down|power/i,
  );
  await expect(
    dialog.locator(
      `[data-request-id="${totals.turn.requestId}"] [data-records-result]`,
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a newly submitted chart follow-up opens the one Insights workspace and executes once; reload only restores evidence", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard");
  let dialog = await open(page);
  const first = await ask(page, "Show my purchases");
  const total = await ask(page, "What is the recorded total for those?");
  const chart = await ask(page, "Show that by category as a chart");
  expect(chart.turn.answer.recordsResult?.snapshotId).toBe(
    first.turn.answer.recordsResult?.snapshotId,
  );
  expect(chart.turn.answer.recordsResult?.queryFingerprint).toBe(
    total.turn.answer.recordsResult?.queryFingerprint,
  );
  await expect(page).toHaveURL(/\/insights$/);
  await expect(chart.article.getByRole("status")).toContainText(
    "executed and verified",
    { timeout: 20000 },
  );
  await expect(page.getByTestId("customer-studio")).toHaveCount(1);
  const panelBox = await dialog.boundingBox();
  const headerBox = await dialog.locator(".careos-header").boundingBox();
  expect(panelBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(headerBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
  await expect(
    dialog.getByRole("button", { name: "Close North Star", exact: true }),
  ).toBeInViewport();
  const evidence = info.outputPath("north-chart-conversation.png");
  await page.screenshot({ path: evidence });
  await info.attach("newly-executed-native-chart-conversation", {
    path: evidence,
    contentType: "image/png",
  });
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  const nativeChart = page
    .getByTestId("customer-studio")
    .locator(".ag-studio-layout-widget")
    .filter({
      has: page.locator(".ag-studio-layout-widget-title", {
        hasText: /^Recorded value \(USD\)$/,
      }),
    });
  await expect(nativeChart.getByRole("figure")).toHaveAttribute(
    "aria-label",
    /2 series/,
  );
  await nativeChart.scrollIntoViewIfNeeded();
  const nativeEvidence = info.outputPath("north-native-category-chart.png");
  await nativeChart.screenshot({ path: nativeEvidence });
  await info.attach("actual-native-category-chart", {
    path: nativeEvidence,
    contentType: "image/png",
  });
  let posts = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/api\/(?:careos|intelligence)\//.test(new URL(r.url()).pathname)
    )
      posts++;
  });
  await page.reload();
  dialog = await open(page);
  const saved = dialog.locator(`[data-request-id="${chart.turn.requestId}"]`);
  await expect(saved.locator("[data-records-result]")).toBeVisible();
  await expect(saved).not.toContainText("executed and verified");
  await expect(page.getByTestId("customer-studio")).toHaveCount(1);
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-layout-widget-title")
      .filter({ hasText: /^Sample purchase value \(USD\)$/ }),
  ).toHaveCount(0);
  expect(posts).toBe(0);
  expect(errors).toEqual([]);
});

test("reopening a completed chart preserves manual native filters and still permits exact-product care without chart replay", async ({
  page,
}) => {
  await page.goto("/dashboard");
  let dialog = await open(page);
  const first = await ask(page, "Show my purchases");
  const chart = await ask(page, "Show that by category as a chart");
  await expect(chart.article.getByRole("status")).toContainText(
    "executed and verified",
    { timeout: 20000 },
  );
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  const category = page.getByRole("combobox", {
    name: "Category",
    exact: true,
    // After reopening the modal, read back the underlying native selection;
    // do not interact through the modal or treat aria-hidden as a missing filter.
    includeHidden: true,
  });
  await category.selectOption("Kitchen");
  const selected = page
    .getByTestId("insight-documents-care")
    .locator("[data-purchase-id]");
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute(
    "data-purchase-id",
    "00000000-0000-4000-8000-000000000202",
  );
  dialog = await open(page);
  await expect(
    dialog.locator(
      `[data-request-id="${chart.turn.requestId}"] [data-records-result]`,
    ),
  ).toBeVisible();
  // Flush the actual effect/frame boundary that formerly replayed the chart.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(category).toHaveValue("Kitchen");
  await expect(selected).toHaveCount(1);
  const sample = page
    .getByTestId("customer-studio")
    .locator(".ag-studio-layout-widget")
    .filter({
      has: page.locator(".ag-studio-layout-widget-title", {
        hasText: /^Sample purchase value \(USD\)$/,
      }),
    });
  await expect(sample.locator(".ag-studio-value-widget-content")).toHaveText(
    "89.00",
  );
  await first.article
    .getByRole("link", { name: "Raspberry Pi 5 · 5", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/vault\/00000000-0000-4000-8000-000000000204$/,
  );
  if (!(await dialog.isVisible())) dialog = await open(page);
  await expect(dialog.locator(".careos-context")).toContainText(
    "Raspberry Pi 5",
  );
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/api\/careos\/conversations\/[a-f0-9-]{36}\/turns$/.test(
        new URL(r.url()).pathname,
      ),
  );
  await dialog
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("How do I shut down my Pi?");
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const care = (await saved.json()) as CareTurn;
  expect(care.answer.context?.twinId).toBe(
    "00000000-0000-4000-8000-000000000204",
  );
  await expect(page).toHaveURL(
    /\/vault\/00000000-0000-4000-8000-000000000204$/,
  );
  await expect(
    dialog.locator(
      `[data-request-id="${chart.turn.requestId}"] [data-records-result]`,
    ),
  ).toBeAttached();
});

test("formatting plus receipt refinement changes the actual linked list, while an unresolved qualifier is clarified", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await open(page);
  await ask(page, "Show my purchases");
  const receipts = await ask(page, "Put those in a list with receipts");
  expect(receipts.turn.answer.recordsResult?.query.receipt).toBe("present");
  await expect(
    receipts.article
      .getByRole("list", { name: "Matching saved purchases" })
      .getByRole("listitem"),
  ).toHaveCount(2);
  const unsupported = await ask(page, "Put those Samsung purchases in a list");
  expect(unsupported.turn.answer.outcome).toBe("unsupported");
  await expect(
    unsupported.article.locator("[data-records-result]"),
  ).toHaveCount(0);
  await expect(unsupported.article).toContainText("No qualifier was ignored");
});

test("document and priced predicates produce an actual table with exact document links, without granting model access", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await open(page);
  const result = await ask(
    page,
    "Show my sample purchases with prices and documents in a table",
  );
  expect(result.turn.answer.mode).toBe("deterministic");
  expect(result.turn.answer.recordsResult?.query).toMatchObject({
    price: "present",
    document: "present",
    format: "table",
    origin: "sample",
  });
  const table = result.article.getByRole("table", {
    name: "Matching saved purchases",
  });
  await expect(table.getByRole("row")).toHaveCount(4);
  const amount = table.getByRole("row").nth(1).getByRole("cell").nth(3);
  await expect(amount).toHaveText("$149.00");
  await expect(amount).toHaveCSS("white-space", "nowrap");
  const scrollRegion = result.article.getByRole("region", {
    name: "Scrollable saved-purchase table",
    exact: true,
  });
  const widths = await scrollRegion.evaluate((node) => ({
    visible: node.clientWidth,
    content: node.scrollWidth,
  }));
  await expect(table).toHaveCSS("min-width", "704px");
  if (widths.visible < 704) {
    expect(widths.content).toBeGreaterThan(widths.visible);
    await scrollRegion.focus();
    await scrollRegion.press("ArrowRight");
    await expect
      .poll(() => scrollRegion.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
  } else {
    // Full-width tablet panels can show all columns without overflow.
    expect(widths.content).toBe(widths.visible);
  }
  await expect(
    table.getByRole("link", {
      name: "Headphones · sample receipt",
      exact: true,
    }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000301");
  await expect(
    table.getByRole("link", {
      name: "Speaker · sample care card",
      exact: true,
    }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000303");
  await expect(table).not.toContainText("Raspberry Pi");
  const empty = await ask(page, "Show my purchases without documents");
  expect(empty.turn.answer.recordsResult?.records).toEqual([]);
  await expect(empty.article).toContainText("No matching saved purchases");
});

test("care follow-up stays with the exact product; explicit analysis and short formatting resume the retained library result", async ({
  page,
}) => {
  await page.goto("/dashboard");
  let dialog = await open(page);
  const library = await ask(page, "Show my purchases");
  await library.article
    .getByRole("link", { name: "Raspberry Pi 5 · 5", exact: true })
    .click();
  if (!(await dialog.isVisible())) dialog = await open(page);
  for (const message of [
    "How do I shut down my Pi?",
    "And can I disconnect power now?",
  ]) {
    const response = page.waitForResponse(
      (r) =>
        /\/api\/careos\/conversations\/[a-f0-9-]{36}\/turns$/.test(
          new URL(r.url()).pathname,
        ) && r.request().method() === "POST",
    );
    await dialog
      .getByRole("textbox", { name: "Ask about your purchases", exact: true })
      .fill(message);
    await dialog
      .getByRole("button", { name: "Send to North Star", exact: true })
      .click();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    const turn = (await saved.json()) as CareTurn;
    expect(turn.answer.context?.twinId).toBe(
      "00000000-0000-4000-8000-000000000204",
    );
    expect(turn.answer.recordsResult).toBeUndefined();
    await expect(
      dialog.locator(`[data-request-id="${turn.requestId}"]`),
    ).toContainText(/Shutdown|shut down|disconnect.*power/i);
  }
  const electronics = await ask(page, "Only electronics");
  expect(electronics.turn.answer.recordsResult?.records).toHaveLength(3);
  const total = await ask(page, "Total?");
  expect(total.turn.answer.recordsResult?.snapshotId).toBe(
    electronics.turn.answer.recordsResult?.snapshotId,
  );
  expect(total.turn.answer.recordsResult?.totals[0].amountMinor).toBe(21800);
  const table = await ask(page, "Table please");
  await expect(
    table.article
      .getByRole("table", { name: "Matching saved purchases" })
      .getByRole("row"),
  ).toHaveCount(4);
  await expect(dialog.locator(".careos-context")).toContainText(
    "Raspberry Pi 5",
  );
});
