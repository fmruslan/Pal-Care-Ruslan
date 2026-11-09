import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { careFeed } from "../../src/lib/care/model";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { demoData } from "../../src/lib/demo/fixtures";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import type { CareTurn } from "../../src/lib/careos/contracts";

const twin = "00000000-0000-4000-8000-000000000201";

test("Care itself shows compact shared pills and SVG milestones, with exact-card evidence and scoped focus restoration", async ({
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
    for (const topic of [
      "purchase",
      "delivery",
      "price-window",
      "return-window",
      "warranty",
    ])
      await expect(
        card.locator(`[data-care-milestone="${topic}"]`),
      ).toHaveCount(1);
    expect(
      await card.locator("[data-care-timeline] svg").count(),
    ).toBeGreaterThanOrEqual(5);
  }
  const card = page.getByRole("main").locator(`[data-care-product="${twin}"]`);
  const delivery = card.locator('[data-care-milestone="delivery"]');
  await expect(delivery).not.toBeVisible();
  await card.locator("[data-ownership-unknowns] > summary").press("Enter");
  await expect(delivery).toBeVisible();
  await delivery.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Delivery", exact: true });
  await expect(panel).toHaveAttribute("data-ownership-twin", twin);
  await expect(panel).toContainText("not delivery evidence");
  await page.keyboard.press("Escape");
  await expect(delivery).toBeFocused();
  const other = cards.last();
  const otherTwin = (await other.getAttribute("data-care-product"))!;
  const warranty = other.locator('[data-care-milestone="warranty"]');
  if (!(await warranty.isVisible()))
    await other.locator("[data-ownership-unknowns] > summary").press("Enter");
  await warranty.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-ownership-panel]")).toHaveAttribute(
    "data-ownership-twin",
    otherTwin,
  );
  await page.keyboard.press("Escape");
  await expect(warranty).toBeFocused();
  expect(writes).toEqual([]);
});

test("injected North highlights the homepage milestone beside its answer, validates read-back and never replays History", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const scope = page
    .getByRole("main")
    .locator(`[data-ownership-surface="care"][data-ownership-twin="${twin}"]`);
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
    "Visible cards, supporting facts and evidence revisions were checked",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Care for what you own.",
  );
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(scope).toHaveAttribute("data-care-focused", "delivery");
  await expect(
    scope.locator('[data-care-milestone="delivery"]'),
  ).toHaveAttribute("aria-current", "step");
  await expect(scope.locator("[data-care-focus-evidence]")).toContainText(
    "not delivery evidence",
  );
  await expect(page.locator("[data-ownership-panel]")).toHaveCount(0);
  await expect(scope.locator("[data-care-product]")).toBeVisible();
  await scope
    .getByRole("button", {
      name: "Review evidence & available actions",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delivery", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await north
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("region", { name: "Previous North results" })
    .getByRole("button")
    .first()
    .click();
  await expect(scope).not.toHaveAttribute("data-care-focused", "delivery");
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
    "spacing is not elapsed time",
  );
  if (!test.info().project.name.startsWith("tablet"))
    await page.screenshot({
      path: test.info().outputPath("ownership.png"),
      fullPage: true,
    });
  await pill.focus();
  await pill.press("Enter");
  const panel = page.getByRole("dialog", { name: "Purchased", exact: true });
  await expect(panel).toContainText("Sample purchase record");
  await expect(
    panel.getByRole("link", { name: "View original receipt", exact: true }),
  ).toBeVisible();
  await panel.getByText("All ownership states", { exact: true }).click();
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
    .getByRole("button", { name: "Close ownership evidence", exact: true })
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
    .getByRole("button", { name: "Prepare warranty message", exact: true })
    .click();
  const draft = warranty.getByRole("textbox", {
    name: "Editable warranty enquiry · not sent",
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
    .getByRole("button", { name: "Close ownership evidence", exact: true })
    .click();
  await page
    .locator("#ownership [data-ownership-unknowns] > summary")
    .press("Enter");
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
    .getByRole("button", { name: "Close ownership evidence", exact: true })
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
    .getByRole("button", { name: "Close ownership evidence", exact: true })
    .click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const north = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(north).toContainText(
    "Current route, visible milestone and evidence revision were checked",
  );
  await expect(
    north.locator(`[data-request-id="${history[0].requestId}"]`),
  ).toBeVisible();
  await expect(delivery).toHaveCount(0);
  expect(dispatches).toBe(1);
});
