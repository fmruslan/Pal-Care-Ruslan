import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { CareTurn } from "../../src/lib/careos/contracts";

test.describe.configure({ timeout: 60_000 });
async function open(page: Page) {
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
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
  if (!restoreOpen && !(await dialog.isVisible())) {
    if (
      ["/dashboard", "/purchases", "/documents"].includes(
        new URL(page.url()).pathname,
      )
    ) {
      await page.getByRole("button", { name: "History", exact: true }).click();
      await dialog
        .getByRole("button", { name: "History", exact: true })
        .click();
    } else
      await page
        .getByRole("button", { name: "Ask North Star", exact: true })
        .click();
  }
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "Working on your question. You can keep writing your next one.",
      { exact: true },
    ),
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

async function selectHistory(
  dialog: Locator,
  message: string,
  requestId: string,
) {
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await dialog
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: message, exact: true })
    .click();
  await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
    "data-request-id",
    requestId,
  );
  await expect(dialog.locator("[data-user-message]")).toHaveText(message);
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
  await page.goto("/purchases");
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
    "3 with a saved price · 1 unpriced or reference items left out",
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

test("North opens library-first and what have I bought returns linked results without a purchase picker", async ({
  page,
}) => {
  const prohibited: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    // Fixture mode initializes an empty care conversation on open. That is
    // storage bootstrap, not a care turn/model dispatch or product selection.
    const careBootstrap =
      url.pathname === "/api/careos/conversations" &&
      request.method() === "POST" &&
      JSON.stringify(request.postDataJSON()) === "{}";
    if (
      request.method() === "POST" &&
      !careBootstrap &&
      !/^\/api\/careos\/records\/conversations(?:\/[a-f0-9-]{36}\/turns)?$/.test(
        url.pathname,
      )
    ) {
      prohibited.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/purchases");
  const dialog = await open(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("North Star");
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "All saved purchases",
  );
  await expect(
    dialog.getByRole("button", { name: "Choose purchase", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Powered by CareOS", { exact: true }),
  ).toHaveCount(0);
  const result = await ask(page, "what have I bought");
  expect(result.turn.answer.questionScope).toBe("library");
  expect(result.turn.answer.mode).toBe("deterministic");
  expect(result.turn.answer.outcome).not.toBe("selection");
  expect(result.turn.answer.recordsResult?.records).toHaveLength(4);
  await expect(
    result.article.getByRole("link", { name: /^Everyday headphones/ }),
  ).toHaveAttribute("href", "/vault/00000000-0000-4000-8000-000000000201");
  await expect(
    page.getByRole("dialog", { name: "Choose a purchase", exact: true }),
  ).toHaveCount(0);
  expect(prohibited).toEqual([]);
});

test("enlarged narrow-screen text keeps result and composer reachable in page flow", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/purchases");
  const dialog = await open(page);
  await ask(page, "Show my sample purchases");
  const submittedPosts = [...posts];
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const input = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  const draft = "Unsent accessibility draft";
  await input.focus();
  await input.fill(draft);
  // A textarea scroll target need not expose its ancestor's disclosure/padding.
  // Test the complete page-flow composer explicitly, at the same viewport.
  await dialog.locator(".careos-composer").scrollIntoViewIfNeeded();
  await expect(input).toBeFocused();
  const geometry = await dialog.evaluate((el) => {
    const transcript = el
      .querySelector(".careos-transcript")!
      .getBoundingClientRect();
    const composer = el
      .querySelector(".careos-composer")!
      .getBoundingClientRect();
    return {
      transcriptHeight: transcript.height,
      composerTop: composer.top,
      composerBottom: composer.bottom,
      viewport: innerHeight,
      viewportWidth: innerWidth,
      fontSize: parseFloat(
        getComputedStyle(el.querySelector("textarea")!).fontSize,
      ),
    };
  });
  expect(geometry.viewportWidth).toBe(390);
  expect(geometry.viewport).toBe(844);
  expect(geometry.fontSize).toBeGreaterThanOrEqual(32);
  expect(geometry.transcriptHeight).toBeGreaterThanOrEqual(150);
  expect(geometry.composerTop).toBeGreaterThanOrEqual(-1);
  expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.viewport + 1);

  const expectControlInViewport = async (control: Locator) => {
    await expect(control).toBeVisible();
    const bounds = await control.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        hit: hit !== null && (hit === node || node.contains(hit)),
      };
    });
    const diagnostic = `${control}: ${JSON.stringify(bounds)}`;
    expect(bounds.width, diagnostic).toBeGreaterThanOrEqual(44);
    expect(bounds.height, diagnostic).toBeGreaterThanOrEqual(44);
    expect(bounds.left, diagnostic).toBeGreaterThanOrEqual(-1);
    expect(bounds.right, diagnostic).toBeLessThanOrEqual(
      bounds.viewportWidth + 1,
    );
    expect(bounds.top, diagnostic).toBeGreaterThanOrEqual(-1);
    expect(bounds.bottom, diagnostic).toBeLessThanOrEqual(
      bounds.viewportHeight + 1,
    );
    expect(bounds.hit, `${diagnostic}: target is not clipped or covered`).toBe(
      true,
    );
  };
  const send = dialog.getByRole("button", {
    name: "Send to North Star",
    exact: true,
  });
  await expect(send).toBeEnabled();
  await expectControlInViewport(input);
  await expectControlInViewport(send);
  await page.keyboard.press("Tab");
  await expect(send).toBeFocused();
  await expectControlInViewport(send);
  await expect(input).toHaveValue(draft);
  await dialog.locator("[data-user-message]").scrollIntoViewIfNeeded();
  await expect(dialog.locator("[data-user-message]")).toBeInViewport({
    ratio: 1,
  });
  const context = dialog.getByRole("button", {
    name: "Choose purchase",
    exact: true,
  });
  await context.focus();
  await context.scrollIntoViewIfNeeded();
  await expect(context).toBeFocused();
  await expectControlInViewport(context);
  await expect(input).toHaveValue(draft);
  await expect(dialog).toHaveAttribute("aria-modal", "false");
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("header *, main *")]
      .flatMap((el) => {
        const box = el.getBoundingClientRect();
        return box.width && box.right > 391
          ? [
              {
                tag: el.tagName,
                class: el.className,
                right: box.right,
                text: el.textContent?.slice(0, 80),
              },
            ]
          : [];
      })
      .slice(0, 20),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    JSON.stringify(overflow),
  ).toBeLessThanOrEqual(391);
  expect(
    posts,
    "layout and keyboard traversal must not submit the draft",
  ).toEqual(submittedPosts);
});

test("comparison plus table retrieves prior-period evidence; a plain total keeps the selection without a stale comparison panel", async ({
  page,
}) => {
  // A separate short scenario respects the real six-turn/minute owner guard;
  // neither quota nor conversation cookies are reset inside a scenario.
  await page.goto("/purchases");
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
  await expect(comparison.article).toContainText(
    "Comparison period: 2026-09-01 through 2026-09-30",
  );
  const plainTotal = await ask(page, "Total?");
  expect(plainTotal.turn.answer.recordsResult?.snapshotId).toBe(
    comparison.turn.answer.recordsResult?.snapshotId,
  );
  expect(plainTotal.turn.answer.recordsResult?.comparison).toBeNull();
  await expect(plainTotal.article).not.toContainText("Comparison period:");
  await expect(plainTotal.article).toContainText("$218.00");
});

test("leaving before a chart response keeps the late saved answer without reopening Insights or replaying its action", async ({
  page,
}) => {
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
    await page.goto("/purchases");
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
    await expect(
      dialog.getByRole("button", { name: "Send to North Star", exact: true }),
    ).toBeDisabled();
    // Disabling the clicked Send button can return focus to the document body.
    // Escape belongs to the nonmodal workspace, not to unrelated page content.
    await dialog.focus();
    await expect(dialog).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    const nav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    await nav
      .getByRole("link", { name: "Purchases", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/\/purchases$/);
    await page
      .getByRole("link", { name: "All documents", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/\/documents$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Your documents",
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
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
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
      "Your chart isn’t confirmed yet",
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
  await page.goto("/purchases");
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
  await page.goto("/purchases");
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
  await expect(
    dialog.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
  ).toHaveValue("Keep this draft");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
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
      name: "Show chart in Insights",
      exact: true,
    }),
  ).toBeVisible();
  await totals.article
    .getByRole("button", { name: "Show chart in Insights", exact: true })
    .click();
  await expect(totals.article.getByRole("status")).toContainText(
    "The chart, separate USD totals, filters and matching purchases were checked",
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
  await selectHistory(dialog, totals.turn.message, totals.turn.requestId);
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
  await page.goto("/purchases");
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
    "The chart, separate USD totals, filters and matching purchases were checked",
    { timeout: 20000 },
  );
  await expect(page.getByTestId("customer-studio")).toHaveCount(1);
  await expect(
    page.getByTestId("customer-studio").locator(".ag-studio-layout-widget"),
  ).toHaveCount(7);
  const panelBox = await dialog.boundingBox();
  const headerBox = await dialog.locator("header").boundingBox();
  expect(panelBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(headerBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
  const close = dialog.getByRole("button", {
    name: "Close North Star",
    exact: true,
  });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
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
  await expect(saved).not.toContainText(
    "The chart, separate USD totals, filters and matching purchases were checked",
  );
  await expect(page.getByTestId("customer-studio")).toHaveCount(1);
  const widgets = page
    .getByTestId("customer-studio")
    .locator(".ag-studio-layout-widget");
  await expect(widgets).toHaveCount(7);
  for (const [title, value] of [
    ["Sample purchase value (USD)", "$307.00"],
    ["Verified Sandbox purchase value (USD)", "$0.00"],
  ] as const) {
    const widget = widgets.filter({
      has: page.getByText(title, { exact: true }),
    });
    await expect(widget).toHaveCount(1);
    await expect(widget.locator(".ag-studio-value-widget-content")).toHaveText(
      value,
    );
  }
  await expect(
    widgets
      .filter({
        has: page.locator(".ag-studio-layout-widget-title", {
          hasText: /^Purchases in this view$/,
        }),
      })
      .locator(".ag-studio-value-widget-content"),
  ).toHaveText("4");
  await expect(
    page.getByTestId("customer-studio").locator(".ag-studio-grid-widget"),
  ).toHaveCount(1);
  await expect(page.getByTestId("insight-documents-care")).toHaveCount(1);
  await expect(
    page.getByTestId("customer-studio").locator(".ag-studio-chart-widget"),
  ).toHaveCount(2);
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-layout-widget-title")
      .filter({ hasText: /^Recorded value \(USD\)$/ }),
  ).toHaveCount(1);
  expect(posts).toBe(0);
  expect(errors).toEqual([]);
});

test("reopening a completed chart preserves manual native filters and still permits exact-product care without chart replay", async ({
  page,
}) => {
  await page.goto("/purchases");
  let dialog = await open(page);
  const first = await ask(page, "Show my purchases");
  const chart = await ask(page, "Show that by category as a chart");
  await expect(chart.article.getByRole("status")).toContainText(
    "The chart, separate USD totals, filters and matching purchases were checked",
    { timeout: 20000 },
  );
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  const category = page.getByRole("combobox", {
    name: "Category",
    exact: true,
  });
  if (!(await category.isVisible()))
    await page.getByText("Filters & sort", { exact: true }).click();
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
    "$89.00",
  );
  await selectHistory(dialog, first.turn.message, first.turn.requestId);
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
  await selectHistory(dialog, chart.turn.message, chart.turn.requestId);
  await expect(
    dialog.locator(
      `[data-request-id="${chart.turn.requestId}"] [data-records-result]`,
    ),
  ).toBeVisible();
});

test("formatting plus receipt refinement changes the actual linked list, while an unresolved qualifier is clarified", async ({
  page,
}) => {
  await page.goto("/purchases");
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
  await expect(unsupported.article).toContainText(
    "no unknown condition was silently removed",
  );
  await expect(unsupported.article).toContainText(
    "limited saved-record fallback couldn't interpret",
  );
});

test("document and priced predicates produce a desktop table or narrow linked cards with exact document links, without granting model access", async ({
  page,
}) => {
  await page.goto("/purchases");
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
  const narrow = page.viewportSize()!.width < 768;
  const rendered = narrow
    ? result.article.getByRole("list", {
        name: "Matching saved purchases",
        exact: true,
      })
    : table;
  if (narrow) {
    await expect(rendered.locator(":scope > li")).toHaveCount(3);
    await expect(rendered.locator(":scope > li").first()).toContainText(
      "$149.00",
    );
    await expect(table).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  } else {
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
    } else expect(widths.content).toBe(widths.visible);
  }
  await expect(
    rendered.getByRole("link", {
      name: "Headphones · sample receipt",
      exact: true,
    }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000301");
  await expect(
    rendered.getByRole("link", {
      name: "Speaker · sample care card",
      exact: true,
    }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000303");
  await expect(rendered).not.toContainText("Raspberry Pi");
  const empty = await ask(page, "Show my purchases without documents");
  expect(empty.turn.answer.recordsResult?.records).toEqual([]);
  await expect(empty.article).toContainText(
    "No saved purchases match these filters. Your filters are still in place.",
  );
});

test("care follow-up stays with the exact product; explicit analysis and short formatting resume the retained library result", async ({
  page,
}) => {
  await page.goto("/purchases");
  let dialog = await open(page);
  const library = await ask(page, "Show my purchases");
  await library.article
    .getByRole("link", { name: "Raspberry Pi 5 · 5", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/vault\/00000000-0000-4000-8000-000000000204$/,
  );
  if (!(await dialog.isVisible())) dialog = await open(page);
  // A link click resolves before Next's route/context effects necessarily do.
  // Assert the actual handoff before submitting; retain the exact reply checks.
  await expect(dialog.locator(".careos-context")).toContainText(
    "Raspberry Pi 5",
  );
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
  if (page.viewportSize()!.width < 768) {
    await expect(
      table.article
        .getByRole("list", { name: "Matching saved purchases", exact: true })
        .locator(":scope > li"),
    ).toHaveCount(3);
  } else {
    await expect(
      table.article
        .getByRole("table", { name: "Matching saved purchases" })
        .getByRole("row"),
    ).toHaveCount(4);
  }
  await expect(dialog.locator(".careos-context")).toContainText(
    "Raspberry Pi 5",
  );
});
