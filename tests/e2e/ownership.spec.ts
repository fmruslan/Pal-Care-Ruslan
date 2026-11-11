import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { careFeed } from "../../src/lib/care/model";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { demoData } from "../../src/lib/demo/fixtures";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import type { CareTurn } from "../../src/lib/careos/contracts";

const twin = "00000000-0000-4000-8000-000000000201";

test("Care shows known-only compact SVG milestones, with exact-card evidence and scoped focus restoration", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.goto("/dashboard?milestone=delivery");
  await expect(page.locator("[data-ownership-panel]")).toHaveCount(0);
  const cards = page.getByRole("main").locator("[data-care-product]");
  expect(await cards.count()).toBeGreaterThan(0);
  expect(
    new Set(
      await cards.evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-care-product")),
      ),
    ).size,
  ).toBe(await cards.count());
  for (const card of await cards.all()) {
    await expect(card.locator("[data-ownership-pill]")).toBeVisible();
    const rail = card.locator("[data-care-timeline]");
    const milestones = rail.locator("[data-care-milestone]");
    await expect(rail.getByRole("region")).toHaveAccessibleName(
      /care summary\. Spacing is not to scale\./,
    );
    for (const state of ["unknown", "unavailable", "not-applicable"])
      await expect(
        rail.locator(`[data-milestone-state="${state}"]`),
      ).toHaveCount(0);
    await expect(card.locator('[data-care-milestone="purchase"]')).toHaveCount(
      1,
    );
    await expect(
      card.locator('[data-care-milestone="purchase"]'),
    ).toBeVisible();
    // Every displayed milestone keeps its decorative SVG; missing facts do not
    // create extra steps just to satisfy an arbitrary five-icon minimum.
    await expect(rail.locator("ol > li > svg")).toHaveCount(
      await milestones.count(),
    );
    await expect(rail.locator("svg:not([aria-hidden='true'])")).toHaveCount(0);
    await expect(card.locator("[data-ownership-unknowns]")).toHaveCount(0);
  }
  const card = page.getByRole("main").locator(`[data-care-product="${twin}"]`);
  await expect(card.locator("[data-care-milestone]")).toHaveCount(1);
  const purchase = card.locator('[data-care-milestone="purchase"]');
  await expect(purchase).toHaveAttribute("data-milestone-state", "recorded");
  await purchase.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Purchased", exact: true });
  await expect(panel).toHaveAttribute("data-ownership-twin", twin);
  await expect(panel).toContainText("Example purchase record");
  await page.keyboard.press("Escape");
  await expect(purchase).toBeFocused();
  const other = cards.last();
  const otherTwin = (await other.getAttribute("data-care-product"))!;
  expect(otherTwin).not.toBe(twin);
  const otherPill = other.locator("[data-ownership-pill]");
  await otherPill.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-ownership-panel]")).toHaveAttribute(
    "data-ownership-twin",
    otherTwin,
  );
  await page.keyboard.press("Escape");
  await expect(otherPill).toBeFocused();
  expect(writes).toEqual([]);
});

test("Care Details retains every unknown milestone, full source facts and keyboard-accessible evidence without inventing dates", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.goto("/dashboard");
  await page
    .getByRole("main")
    .locator(`[data-care-product="${twin}"]`)
    .getByRole("link", { name: "Details", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/vault/${twin}$`));
  const ownership = page.locator("#ownership");
  const revision = (await ownership.getAttribute("data-ownership-revision"))!;
  const unknowns = ownership.locator("[data-ownership-unknowns]");
  const summary = unknowns.locator("summary");
  const facts = [
    [
      "shipment",
      "Shipment",
      "not-applicable",
      "No merchant tracking or carrier feed is connected",
    ],
    [
      "delivery",
      "Delivery",
      "not-applicable",
      "a completed payment is not delivery evidence",
    ],
    ["price", "Price protection", "unknown", "Protection not verified"],
    [
      "price-window",
      "Price-adjustment deadline",
      "unknown",
      "No applicable price-adjustment deadline is established",
    ],
    [
      "return-window",
      "Return deadline",
      "unknown",
      "No confirmed return deadline",
    ],
    ["returns", "Return progress", "unknown", "No supported return progress"],
    [
      "refunds",
      "Refund",
      "unknown",
      "Purchase payment evidence is not refund evidence",
    ],
    [
      "warranty",
      "Warranty expiration",
      "unknown",
      "No verified warranty expiration dates",
    ],
    [
      "safety",
      "Safety assessment",
      "unknown",
      "Missing evidence is not a safety all-clear",
    ],
  ] as const;
  await expect(summary).toHaveText(
    `Other care details · unknown or not applicable (${facts.length})`,
  );
  await expect(unknowns).not.toHaveAttribute("open", "");
  for (const [topic] of facts)
    await expect(
      unknowns.locator(`[data-ownership-milestone="${topic}"]`),
    ).not.toBeVisible();
  await summary.focus();
  await summary.press("Enter");
  await expect(summary).toBeFocused();
  await expect(unknowns).toHaveAttribute("open", "");
  await expect(unknowns).toContainText(
    "missing information doesn’t confirm there are no issues",
  );
  await expect(unknowns.locator("[data-ownership-milestone]")).toHaveCount(
    facts.length,
  );
  for (const [topic, title, state, detail] of facts) {
    const milestone = unknowns.locator(`[data-ownership-milestone="${topic}"]`);
    await expect(milestone).toBeVisible();
    await expect(milestone).toHaveAttribute("data-milestone-state", state);
    await expect(milestone).toHaveAttribute("data-milestone-verified", "false");
    await expect(milestone).toHaveAttribute("aria-haspopup", "dialog");
    await milestone.focus();
    await milestone.press("Enter");
    const panel = page.getByRole("dialog", { name: title, exact: true });
    await expect(panel).toHaveAttribute("data-ownership-twin", twin);
    await expect(panel).toHaveAttribute("data-ownership-topic", topic);
    await expect(panel).toHaveAttribute("data-ownership-revision", revision);
    await expect(panel).toContainText(detail);
    await expect(
      panel.locator(`[data-ownership-fact="${twin}:${topic}"] time`),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(milestone).toBeFocused();
  }
  const fullDetails = ownership.locator("details").filter({
    has: page.getByText("Dates, sources & next steps", { exact: true }),
  });
  await fullDetails.locator(":scope > summary").press("Enter");
  await expect(fullDetails).toHaveAttribute("open", "");
  await expect(fullDetails.locator("[data-ownership-fact]")).toHaveCount(
    facts.length + 1,
  );
  for (const [topic, , , detail] of facts) {
    const fact = fullDetails.locator(
      `[data-ownership-fact="${twin}:${topic}"]`,
    );
    await expect(fact).toBeVisible();
    await expect(fact).toContainText(detail);
    await expect(fact.locator("time")).toHaveCount(0);
  }
  const purchase = fullDetails.locator(
    `[data-ownership-fact="${twin}:purchase"]`,
  );
  await expect(purchase).toContainText("Example purchase record");
  await expect(
    purchase.getByRole("link", { name: "View original receipt", exact: true }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000301");
  expect(writes).toEqual([]);
});

test("injected North highlights the homepage milestone beside its answer, validates read-back and never replays History", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const scope = page
    .getByRole("main")
    .locator(`[data-ownership-surface="care"][data-ownership-twin="${twin}"]`);
  const deliveryMilestone = scope.locator('[data-care-milestone="delivery"]');
  await expect(deliveryMilestone).toHaveCount(0);
  const revision = (await scope.getAttribute("data-ownership-revision"))!;
  const {
    version: _v,
    referenceDate: _r,
    timezone: _t,
    ...query
  } = emptyRecordsQuery("2026-11-04");
  void _v;
  void _r;
  void _t;
  let dispatches = 0;
  await page.route(
    "**/api/careos/records/conversations/*/turns",
    async (route) => {
      dispatches++;
      const input = route.request().postDataJSON();
      const feed = careFeed({
        data: demoData,
        knowledge: [],
        guardian: emptyOverview(),
        activity: { items: [], unavailable: [] },
      });
      const answer = careStatusAnswer(
        feed,
        input.revision,
        [twin],
        "open_delivery",
      );
      answer.careHighlights![0].revision = revision;
      answer.conversationPlan = {
        task: "aftercare",
        relation: "selected",
        query: { ...query, outcome: "query" },
        comparison: null,
        productSearch: "",
        productAction: "open_delivery",
        careQuestion: "",
        clarification: "",
      };
      await route.fulfill({
        json: { requestId: input.requestId, message: input.message, answer },
      });
    },
  );
  await page
    .getByRole("searchbox", {
      name: "Search products and documents",
      exact: true,
    })
    .fill("Show all my purchases");
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  const north = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(north).toContainText(
    "Their saved sources were checked; no records changed",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Care for what you own.",
  );
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(scope).toHaveAttribute("data-care-focused", "delivery");
  await expect(deliveryMilestone).toHaveAttribute("aria-current", "step");
  await expect(deliveryMilestone).toHaveAttribute(
    "data-milestone-state",
    "not-applicable",
  );
  await expect(deliveryMilestone).toHaveAttribute(
    "data-milestone-verified",
    "false",
  );
  await expect(deliveryMilestone).toBeVisible();
  await expect(scope.locator("[data-care-focus-evidence]")).toContainText(
    "not delivery evidence",
  );
  await expect(page.locator("[data-ownership-panel]")).toHaveCount(0);
  await expect(scope.locator("[data-care-product]")).toBeVisible();
  const originalRequest = await north
    .locator("[data-native-north-result]")
    .getAttribute("data-request-id");
  expect(originalRequest).toMatch(/^[a-f0-9-]{36}$/);
  // The tablet sheet can cover this source control. Use the supported minimize
  // action, not a forced click through the panel, without departing the chat.
  await north
    .getByRole("button", { name: "Minimize North Star", exact: true })
    .click();
  await scope
    .getByRole("button", {
      name: "View sources & next steps",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delivery", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Restore North Star", exact: true })
    .click();
  await expect(north.locator("[data-native-north-result]")).toHaveAttribute(
    "data-request-id",
    originalRequest!,
  );
  expect(dispatches).toBe(1);
  await north
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await north
    .getByRole("region", { name: "Previous chats", exact: true })
    .getByRole("button", { name: /Show all my purchases/ })
    .click();
  await north
    .locator("header")
    .getByRole("button", { name: "History", exact: true })
    .click();
  await north
    .getByRole("region", { name: "Previous North results" })
    .getByRole("button")
    .first()
    .click();
  await expect(scope).not.toHaveAttribute("data-care-focused", "delivery");
  await expect(deliveryMilestone).toHaveCount(0);
  expect(dispatches).toBe(1);
});

test("ownership pill, complete timeline, evidence and keyboard are useful without model or financial calls", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/vault/${twin}`);
  const pill = page.locator("[data-ownership-pill]");
  await expect(pill).toContainText("Purchased");
  await expect(page.locator("#ownership")).toContainText(
    "Spacing is not to scale",
  );
  if (!test.info().project.name.startsWith("tablet"))
    await page.screenshot({
      path: test.info().outputPath("ownership.png"),
      fullPage: true,
    });
  await pill.focus();
  await pill.press("Enter");
  const panel = page.getByRole("dialog", { name: "Purchased", exact: true });
  await expect(panel).toContainText("Example purchase record");
  await expect(
    panel.getByRole("link", { name: "View original receipt", exact: true }),
  ).toBeVisible();
  await panel.getByText("All care details", { exact: true }).click();
  await expect(panel).toContainText("No verified refund recorded");
  await expect(panel).toContainText("Not comprehensively checked");
  if (!test.info().project.name.startsWith("tablet"))
    await panel.screenshot({
      path: test.info().outputPath("ownership-evidence.png"),
    });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await panel.getByRole("button", { name: /Delivery.*Not connected/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Delivery", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill).toBeFocused();
  await page
    .locator("#ownership [data-ownership-unknowns] > summary")
    .press("Enter");
  await page.locator('[data-ownership-milestone="delivery"]').click();
  const delivery = page.getByRole("dialog", { name: "Delivery", exact: true });
  await expect(delivery).toContainText("Fictional goods do not ship");
  await delivery
    .getByRole("button", { name: "Close care details", exact: true })
    .click();
  expect(writes).toEqual([]);
});

test("deep-linked warranty and return milestones preserve exact dates, editable unsent drafts and reload", async ({
  page,
}) => {
  await page.goto(`/vault/${twin}?milestone=warranty`);
  const warranty = page.getByRole("dialog", {
    name: "Warranty expiration",
    exact: true,
  });
  await expect(warranty).toContainText("No verified warranty expiration dates");
  await warranty
    .getByRole("button", { name: "Draft warranty message", exact: true })
    .click();
  const draft = warranty.getByRole("textbox", {
    name: "Your warranty draft · not sent",
    exact: true,
  });
  await expect(draft).toHaveValue(
    /Everyday headphones \(F-01\), purchased on 2026-10-18/,
  );
  await draft.fill("Fictional warranty enquiry; not sent");
  await expect(draft).toHaveValue("Fictional warranty enquiry; not sent");
  await warranty
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page.reload();
  await expect(warranty).toBeVisible();
  await expect(warranty.getByRole("textbox")).toHaveCount(0);
  await warranty
    .getByRole("button", { name: "Close care details", exact: true })
    .click();
  // Wait for modal close/focus restoration before the summary's keyboard toggle.
  // Otherwise the closing dialog can take focus back before Enter opens it.
  await expect(warranty).toHaveCount(0);
  await expect(page.locator("[data-ownership-pill]")).toBeFocused();
  await page
    .locator("#ownership [data-ownership-unknowns] > summary")
    .press("Enter");
  await expect(
    page.locator("#ownership [data-ownership-unknowns]"),
  ).toHaveAttribute("open", "");
  await page.locator('[data-ownership-milestone="return-window"]').click();
  await expect(
    page.getByRole("dialog", { name: "Return deadline", exact: true }),
  ).toContainText("No confirmed return deadline");
  await page
    .getByRole("link", {
      name: "Prepare an unsent return enquiry",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/care/${twin}#returns$`));
  await expect(page.locator("#returns")).toContainText(
    "No supported return progress",
  );
});

test("ownership reflows at 320px and enlarged text while horizontal milestones remain individually reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/vault/${twin}`);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  await page
    .locator("#ownership [data-ownership-unknowns] > summary")
    .press("Enter");
  await page.locator('[data-ownership-milestone="safety"]').click();
  const panel = page.getByRole("dialog", {
    name: "Safety assessment",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await panel
    .getByRole("button", { name: "Close care details", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("injected North proposal executes and reads back exact milestone; saved History never auto-replays it", async ({
  page,
}) => {
  // Injected transport only. No real provider/browser authority is exercised.
  await page.goto(`/vault/${twin}`);
  const revision = await page
    .locator("#ownership")
    .getAttribute("data-ownership-revision");
  expect(revision).toMatch(/^[a-f0-9]{1,8}$/);
  const {
    version: _v,
    referenceDate: _r,
    timezone: _t,
    ...query
  } = emptyRecordsQuery("2026-11-04");
  void _v;
  void _r;
  void _t;
  const history: CareTurn[] = [];
  let dispatches = 0;
  await page.route(
    "**/api/careos/records/conversations/*/turns",
    async (route) => {
      dispatches++;
      const input = route.request().postDataJSON();
      const feed = careFeed({
        data: demoData,
        knowledge: [],
        guardian: emptyOverview(),
        activity: { items: [], unavailable: [] },
      });
      const answer = careStatusAnswer(
        feed,
        input.revision,
        [twin],
        "open_delivery",
      );
      answer.ownershipPresentation!.revision = revision!;
      answer.conversationPlan = {
        task: "aftercare",
        relation: "selected",
        query: { ...query, outcome: "query" },
        comparison: null,
        productSearch: "",
        productAction: "open_delivery",
        careQuestion: "",
        clarification: "",
      };
      const turn = {
        requestId: input.requestId,
        message: input.message,
        answer,
      };
      history.push(turn);
      await route.fulfill({ json: turn });
    },
  );
  // Use a recognized records entry to exercise its real execution callback in
  // provider-off CI; the proposed ownership action itself is fully injected.
  await page.goto("/purchases");
  const field = page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
  await field.fill("Show all my purchases");
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/vault/${twin}\\?milestone=delivery$`),
  );
  const delivery = page.getByRole("dialog", { name: "Delivery", exact: true });
  await expect(delivery).toHaveAttribute("data-ownership-revision", revision!);
  await expect(delivery).toHaveAttribute("data-ownership-twin", twin);
  await expect(delivery).toContainText("not delivery evidence");
  await delivery
    .getByRole("button", { name: "Close care details", exact: true })
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const north = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(north).toContainText(
    "Opened the saved delivery details for this purchase and checked the matching sources",
  );
  await expect(
    north.locator(`[data-request-id="${history[0].requestId}"]`),
  ).toBeVisible();
  await expect(delivery).toHaveCount(0);
  expect(dispatches).toBe(1);
});
