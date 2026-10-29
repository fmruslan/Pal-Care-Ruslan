import {
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoData } from "../../src/lib/demo/fixtures";
import type { GuardianOverview } from "../../src/lib/price-guardian/contracts";

// These are real local SDK/browser checks with scripted planning, not model or
// PayPal acceptance. The existing config supplies fixtures or a dedicated test DB.
const dataSource = process.env.E2E_DATA_SOURCE ?? "fixtures";
const primaryLabels = ["Home", "Purchases", "Insights", "Documents"];
const primaryPaths = ["/dashboard", "/vault", "/insights", "/documents"];
const headphoneId = "00000000-0000-4000-8000-000000000201";
const piId = "00000000-0000-4000-8000-000000000204";

const test = base.extend<{ readOnlyBrowser: void }>({
  readOnlyBrowser: [
    async ({ page }, use) => {
      const prohibited: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const apiWrite =
          url.pathname.startsWith("/api/") &&
          !["GET", "HEAD", "OPTIONS"].includes(request.method());
        const externalProvider =
          /(^|\.)(paypal\.com|openai\.com|chatgpt\.com|channel3\.ai)$/.test(
            url.hostname,
          );
        if (apiWrite || externalProvider) {
          prohibited.push(`${request.method()} ${url.origin}${url.pathname}`);
          await route.abort("blockedbyclient");
        } else await route.continue();
      });
      await use(undefined);
      expect(
        prohibited,
        "Fixture Insights presentation must not send financial, model, or other API writes",
      ).toEqual([]);
      expect(errors, "No uncaught application/SDK errors").toEqual([]);
    },
    { auto: true },
  ],
});
test.describe.configure({ timeout: 60_000 });

type SourceRecord = {
  id: string;
  name: string;
  category: string;
  origin: "sample" | "sandbox";
  metadata: string;
  href: string;
  receiptHref: string | null;
  careHref: string | null;
  documentCount: number;
  attention: boolean;
};

async function readRecords(root: Locator): Promise<SourceRecord[]> {
  return root.locator("article[data-purchase-id]").evaluateAll((articles) =>
    articles.map((article) => {
      const links = [...article.querySelectorAll<HTMLAnchorElement>("a")];
      const identity = links.find((link) =>
        link.pathname.startsWith("/vault/"),
      );
      const paragraphs = [...article.querySelectorAll("p")].map(
        (node) => node.textContent?.trim() ?? "",
      );
      const metadata = paragraphs[0];
      const documents = paragraphs.find((text) =>
        /^\d+ saved document/.test(text),
      );
      return {
        id: article.getAttribute("data-purchase-id") ?? "",
        name: identity?.textContent?.trim() ?? "",
        category: metadata.split(" · ")[1],
        origin: article.textContent?.includes("Verified Sandbox purchase")
          ? ("sandbox" as const)
          : ("sample" as const),
        metadata,
        href: identity?.getAttribute("href") ?? "",
        receiptHref:
          links
            .find((link) => link.textContent?.startsWith("Open receipt"))
            ?.getAttribute("href") ?? null,
        careHref:
          links
            .find((link) => link.pathname.endsWith("/care"))
            ?.getAttribute("href") ?? null,
        documentCount: Number(documents?.match(/^\d+/)?.[0] ?? 0),
        attention: !!article.querySelector(":scope > ul > li"),
      };
    }),
  );
}

function sourceSummary(page: Page) {
  return page.locator("details").filter({
    has: page.locator("summary").filter({
      hasText: /^Source records & accessible summary/,
    }),
  });
}

function nativeWidget(page: Page, title: string) {
  return page
    .getByTestId("customer-studio")
    .locator(".ag-studio-layout-widget")
    .filter({
      has: page.locator(".ag-studio-layout-widget-title").filter({
        hasText: new RegExp(`^${title}$`),
      }),
    });
}

function viewButton(page: Page, name: string) {
  return page
    .getByLabel("Insight views", { exact: true })
    .getByRole("button", { name, exact: true });
}

function ids(records: SourceRecord[]) {
  return records.map((record) => record.id).sort();
}

async function openWorkspace(page: Page) {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Personal Purchase Intelligence",
  );
  const initialRecords = page.getByTestId("insight-source-records");
  await expect(initialRecords).toHaveCount(1);
  const records = await readRecords(initialRecords);
  const sampleIds = demoData.twins.map((twin) => twin.id).sort();
  if (dataSource === "fixtures") {
    expect(ids(records)).toEqual(sampleIds);
    expect(records.every((record) => record.origin === "sample")).toBe(true);
  } else {
    expect(ids(records)).toEqual(expect.arrayContaining(sampleIds));
    await expect(
      page.getByText(/newest 100 saved purchase window/),
    ).toBeVisible();
  }
  await expect(
    page.getByText(`${records.length} available purchases`, {
      exact: false,
    }),
  ).toBeVisible();
  const explore = page.getByRole("button", {
    name: "Explore interactive Insights",
    exact: true,
  });
  await explore.focus();
  await explore.press("Enter");
  await expect(page.getByTestId("customer-studio")).toBeVisible({
    timeout: 20_000,
  });
  await expect(viewButton(page, "My Purchases")).toBeEnabled({
    timeout: 20_000,
  });
  await expect(
    page.getByTestId("customer-studio").locator(".ag-studio-grid-widget"),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-chart-widget canvas")
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await assertSelection(page, records);
  return records;
}

async function assertSelection(
  page: Page,
  expected: SourceRecord[],
  grid = true,
) {
  const summary = sourceSummary(page);
  await expect
    .poll(async () => ids(await readRecords(summary)))
    .toEqual(ids(expected));
  await expect(page.getByLabel("Personal Insights filter scope")).toContainText(
    `${expected.length} purchases in the current Studio selection`,
  );
  const evidence = page
    .getByTestId("customer-studio")
    .getByTestId("insight-documents-care");
  await expect
    .poll(async () => ids(await readRecords(evidence)))
    .toEqual(ids(expected));
  const kpi = nativeWidget(page, "Purchases in this view");
  await expect(kpi).toBeVisible();
  if (expected.length) {
    await expect(kpi.locator(".ag-studio-value-widget-content")).toHaveText(
      String(expected.length),
    );
  } else {
    // An empty native sum can be 0 or the SDK's explicit no-data state; it must
    // never keep a stale positive denominator or substitute all purchases.
    await expect
      .poll(async () => {
        const value = await kpi
          .locator(".ag-studio-value-widget-content")
          .allTextContents();
        return (
          value.join("").trim() === "0" ||
          (await kpi.locator(".ag-studio-widget-no-data-text").isVisible())
        );
      })
      .toBe(true);
    await expect(
      summary.getByText("No saved purchases match this view.", {
        exact: false,
      }),
    ).toHaveCount(1);
  }
  if (grid && expected.length) {
    const nativeGrid = nativeWidget(page, "Saved purchases").getByRole("grid");
    await expect(nativeGrid).toBeVisible();
    await expect(nativeGrid).toHaveAttribute(
      "aria-rowcount",
      String(expected.length + 1),
    );
  }
  await expect(
    page.getByRole("alert").filter({
      hasText: "widget records could not be validated",
    }),
  ).toHaveCount(0);
}

async function showSources(page: Page) {
  const summary = sourceSummary(page);
  if (!(await summary.evaluate((node) => node.hasAttribute("open"))))
    await summary.locator(":scope > summary").click();
  return summary;
}

async function ask(page: Page, message: string, suggested = false) {
  await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
  await expect(dialog).toContainText("Your purchases · Personal Insights");
  if (suggested)
    await dialog.getByRole("button", { name: message, exact: true }).click();
  else {
    const composer = dialog.getByLabel("Ask about your purchase", {
      exact: true,
    });
    await composer.fill(message);
    await composer.press("Enter");
  }
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    message,
  );
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0, {
    timeout: 20000,
  });
  const answer = dialog.locator("[data-latest-answer]");
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("Demo response · no live AI");
  return { dialog, answer };
}

async function closeAssistant(page: Page) {
  await page.getByRole("button", { name: "Close CareOS", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "CareOS", exact: true }),
  ).not.toBeVisible();
}

async function inspectTools(page: Page) {
  const tools = page.getByTestId("customer-studio-tools");
  if (!(await tools.isVisible()))
    await page
      .getByText("How CareOS changed this view", { exact: true })
      .click();
  await expect(tools).toBeVisible();
  await expect(tools).toContainText("view_schema → view_page");
  await expect(tools).toContainText("personal_purchase_view → view_page");
  await expect(tools).toContainText("Presentation state read back and checked");
}

const usd = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );

test("customer navigation keeps four coherent destinations and secondary exploration", async ({
  page,
}) => {
  await page.goto("/dashboard");
  // Select by the known CSS breakpoint, not a non-waiting visibility snapshot
  // while the server-streamed shell may still be arriving.
  const navigation = page.getByRole("navigation", {
    name:
      page.viewportSize()!.width < 1024
        ? "Mobile navigation"
        : "Main navigation",
  });
  await expect(navigation).toBeVisible();
  for (let index = 0; index < primaryLabels.length; index++) {
    await expect(navigation.getByRole("link")).toHaveText(primaryLabels);
    for (let link = 0; link < primaryPaths.length; link++)
      await expect(navigation.getByRole("link").nth(link)).toHaveAttribute(
        "href",
        primaryPaths[link],
      );
    await navigation
      .getByRole("link", {
        name: primaryLabels[index],
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${primaryPaths[index]}$`));
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(
      primaryLabels[index],
    );
    await expect(page.locator('a[href^="/merchant"]')).toHaveCount(0);
    await expect(page.locator(".careos-launcher")).toHaveCount(1);
  }
  const explore = page.locator("summary").filter({ hasText: /^Explore$/ });
  await explore.focus();
  await explore.press("Enter");
  const secondary = page.getByRole("navigation", { name: "More to explore" });
  await expect(secondary.getByRole("link")).toHaveText([
    "Demo shop",
    "Price Guardian",
    "Safety & recalls",
    "Replacements",
  ]);
  await page.keyboard.press("Tab");
  await expect(secondary.getByRole("link").first()).toBeFocused();
  for (const link of await navigation.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("native purchase grid, chart and KPI share provenance filters and real category cross-filters", async ({
  page,
}) => {
  const records = await openWorkspace(page);
  await expect(viewButton(page, "Documents & Care")).toBeEnabled();
  await expect(viewButton(page, "Price Adjustments")).toBeEnabled();
  await page.screenshot({
    path: `test-results/customer-insights/${test.info().project.name}-purchases.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByLabel("Purchase evidence", { exact: true })
    .selectOption("sandbox");
  const sandbox = records.filter((record) => record.origin === "sandbox");
  await assertSelection(page, sandbox);
  if (dataSource === "fixtures") expect(sandbox).toHaveLength(0);
  // Database mode deliberately derives the expected set from its saved records;
  // it neither requires nor fabricates a completed Sandbox purchase.
  const sources = await showSources(page);
  await expect(
    sources.getByText("Sample purchase", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Purchase evidence", { exact: true })
    .selectOption("sample");
  const samples = records.filter((record) => record.origin === "sample");
  await assertSelection(page, samples);
  const audio = samples.filter((record) => record.category === "Audio");
  const category = page
    .getByRole("group", { name: "Chart category selection" })
    .getByRole("button", { name: "Audio", exact: true });
  await category.focus();
  await category.press("Enter");
  await expect(category).toHaveAttribute("aria-pressed", "true");
  await assertSelection(page, audio);
  await expect(
    page.getByLabel("Purchase evidence", { exact: true }),
  ).toHaveValue("sample");
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("all");
  await page.getByLabel("Category", { exact: true }).selectOption("Kitchen");
  await expect(category).toHaveAttribute("aria-pressed", "false");
  await assertSelection(
    page,
    samples.filter((record) => record.category === "Kitchen"),
  );
  await page.getByLabel("From", { exact: true }).fill("2100-01-01");
  await page.getByLabel("Through", { exact: true }).fill("2000-01-01");
  await assertSelection(page, []);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await assertSelection(page, records);
  await expect(
    page.getByLabel("Purchase evidence", { exact: true }),
  ).toHaveValue("all");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Through", { exact: true })).toHaveValue("");
});

test("Insights source records retain the exact Twin, receipt and reference-care links", async ({
  page,
}) => {
  const records = await openWorkspace(page);
  const sources = await showSources(page);
  const headphones = sources.locator(
    `article[data-purchase-id="${headphoneId}"]`,
  );
  await expect(headphones).toContainText("$149.00");
  await expect(
    headphones.getByRole("link", { name: "Open receipt →", exact: true }),
  ).toHaveAttribute("href", "/documents/00000000-0000-4000-8000-000000000301");
  const reference = sources.locator(`article[data-purchase-id="${piId}"]`);
  await expect(reference).toContainText("Purchase amount not recorded");
  await expect(
    reference.getByRole("link", { name: "Open receipt →", exact: true }),
  ).toHaveCount(0);
  await expect(
    reference.getByRole("link", { name: "Supported care →", exact: true }),
  ).toHaveAttribute("href", `/vault/${piId}/care`);
  await headphones
    .getByRole("link", { name: "Open receipt →", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Document contents" }),
  ).toContainText("SAMPLE DATA ONLY");
  const back = page.getByRole("link", {
    name: "Back to Everyday headphones",
    exact: true,
  });
  await expect(back).toHaveAttribute("href", `/vault/${headphoneId}`);
  await back.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday headphones",
  );
  await expect(
    page.getByText("Sample price paid", { exact: true }).locator(".."),
  ).toContainText("$149.00");
  await expect(page.locator(".careos-launcher")).toHaveCount(1);

  const savedSandbox = records.find(
    (record) => record.origin === "sandbox" && record.receiptHref,
  );
  if (savedSandbox) {
    await openWorkspace(page);
    const source = (await showSources(page)).locator(
      `article[data-purchase-id="${savedSandbox.id}"]`,
    );
    await source
      .getByRole("link", { name: "Open receipt →", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${savedSandbox.receiptHref}$`));
    await expect(
      page.getByText("Verified Sandbox receipt", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `Back to ${savedSandbox.name}`,
        exact: true,
      }),
    ).toHaveAttribute("href", savedSandbox.href);
  }
  await page.goto("/vault");
  const vaultRecords = await page
    .getByRole("link", { name: /^View Twin for / })
    .evaluateAll((links) =>
      links
        .map((link) => {
          const card = link.closest(".motion-card")!;
          return {
            id: link.getAttribute("href")!.split("/").at(-1)!,
            origin: card.textContent?.includes("Verified sandbox")
              ? "sandbox"
              : "sample",
            category: card
              .querySelector("p")!
              .textContent!.split("/")
              .at(-1)!
              .trim(),
            name: card.querySelector("h2")!.textContent!.trim(),
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  expect(
    records
      .map(({ id, origin, category, name }) => ({
        id,
        origin,
        category,
        name,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ).toEqual(vaultRecords);
});

test("one CareOS host executes real Studio tools for suggested categories, documents, care, attention, adjustments and reset", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const records = await openWorkspace(page);
  await expect(page.locator(".careos-launcher")).toHaveCount(1);
  let turn = await ask(page, "Show my purchases by category", true);
  await expect(turn.answer).toContainText("dashboard state was checked");
  await closeAssistant(page);
  await inspectTools(page);
  await expect(nativeWidget(page, "Purchases by category")).toHaveClass(
    /ag-studio-layout-widget-selected/,
  );
  await assertSelection(page, records);

  const categoryScope = records.filter((record) => record.category === "Audio");
  await page
    .getByRole("group", { name: "Chart category selection" })
    .getByRole("button", { name: "Audio", exact: true })
    .click();
  await assertSelection(page, categoryScope);
  turn = await ask(page, "Show me the evidence behind that number.");
  await expect(turn.answer).toContainText(
    `${categoryScope.length} saved purchases`,
  );
  await closeAssistant(page);
  await assertSelection(page, categoryScope);
  await expect(
    page
      .getByRole("group", { name: "Chart category selection" })
      .getByRole("button", { name: "Audio", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-layout-widget")
      .filter({ has: page.getByTestId("insight-documents-care") }),
  ).toHaveClass(/ag-studio-layout-widget-selected/);

  for (const request of [
    {
      message: "Show my documents",
      filter: (record: SourceRecord) => record.documentCount > 0,
      scope: "with documents",
    },
    {
      message: "Which purchases have product care?",
      filter: (record: SourceRecord) => !!record.careHref,
      scope: "supported care",
    },
    {
      message: "What needs my attention?",
      filter: (record: SourceRecord) => record.attention,
      scope: "recorded attention items",
    },
  ]) {
    turn = await ask(page, request.message);
    await expect(turn.answer).toContainText("dashboard state was checked");
    await closeAssistant(page);
    await expect(viewButton(page, "Documents & Care")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByLabel("Personal Insights filter scope"),
    ).toContainText(request.scope);
    await assertSelection(page, records.filter(request.filter), false);
    await expect(page.getByTestId("insight-attention")).toBeVisible();
    await inspectTools(page);
    await page.screenshot({
      path: `test-results/customer-insights/${test.info().project.name}-${request.scope.replaceAll(" ", "-")}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }

  const response = await page.request.get("/api/guardian");
  expect(response.ok()).toBe(true);
  const guardian = (await response.json()) as GuardianOverview;
  const savedSandbox = new Set(
    records
      .filter((record) => record.origin === "sandbox")
      .map((record) => record.id),
  );
  const verified = guardian.cases.filter(
    (item) =>
      savedSandbox.has(item.twinId) &&
      item.state === "completed" &&
      item.providerStatus === "COMPLETED" &&
      !!item.refundId &&
      !!item.verifiedAt &&
      Number.isFinite(Date.parse(item.verifiedAt)),
  );
  const total = verified.reduce((sum, item) => sum + item.amountMinor, 0);
  const verifiedIds = new Set(verified.map((item) => item.twinId));
  turn = await ask(page, "Show verified adjustments");
  await expect(turn.answer).toContainText(
    `${usd(total)} in independently verified Sandbox price adjustments`,
  );
  await closeAssistant(page);
  await expect(viewButton(page, "Price Adjustments")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await assertSelection(
    page,
    records.filter((record) => verifiedIds.has(record.id)),
    false,
  );
  const adjustments = page.getByTestId("insight-adjustments");
  await expect(
    adjustments.getByText(usd(total), { exact: true }),
  ).toBeVisible();
  await expect(adjustments).toContainText("Not proposed savings");
  await page.screenshot({
    path: `test-results/customer-insights/${test.info().project.name}-adjustments.png`,
    fullPage: true,
    animations: "disabled",
  });
  if (dataSource === "fixtures") expect(total).toBe(0);
  // Even a test DB with recorded Sandbox cases cannot turn samples into refunds.
  await page
    .getByLabel("Purchase evidence", { exact: true })
    .selectOption("sample");
  await assertSelection(page, [], false);
  await expect(adjustments.getByText("$0.00", { exact: true })).toBeVisible();

  turn = await ask(page, "Approve a refund");
  await expect(turn.answer).toContainText("scripted requests, not live AI");
  await closeAssistant(page);
  await assertSelection(page, [], false);
  await expect(viewButton(page, "Price Adjustments")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  turn = await ask(page, "Reset this dashboard");
  await expect(turn.answer).toContainText("dashboard state was checked");
  await closeAssistant(page);
  await inspectTools(page);
  await expect(viewButton(page, "My Purchases")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await assertSelection(page, records);
});

test("browser-local layout add/save/restore is idempotent and does not restore purchase filters", async ({
  page,
}) => {
  const records = await openWorkspace(page);
  const charts = page
    .getByTestId("customer-studio")
    .locator(".ag-studio-chart-widget");
  await expect(charts).toHaveCount(1);
  await page
    .getByRole("button", { name: "Customize layout", exact: true })
    .click();
  await page
    .getByLabel("Add a useful widget", { exact: true })
    .selectOption("category-chart");
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await expect(charts).toHaveCount(2);
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await expect(charts).toHaveCount(2);
  await page
    .getByRole("button", { name: "Finish layout editing", exact: true })
    .click();
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Layout saved in this browser" }),
  ).toBeVisible();
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) =>
      name.startsWith("palcare-personal-layout:v1:"),
    );
    return key ? { key, value: JSON.parse(localStorage.getItem(key)!) } : null;
  });
  expect(stored).not.toBeNull();
  expect(stored!.value.version).toBe(1);
  expect(
    Object.keys(stored!.value.pages.purchases).filter(
      (id) => id === "extra-category-chart",
    ),
  ).toEqual(["extra-category-chart"]);
  await page.getByRole("button", { name: "Reset views", exact: true }).click();
  await expect(charts).toHaveCount(1);
  await assertSelection(page, records);
  // A fresh document retains the saved browser-local layout, not the open SDK.
  await openWorkspace(page);
  await expect(charts).toHaveCount(1);
  await page
    .getByLabel("Purchase evidence", { exact: true })
    .selectOption("sandbox");
  const sandbox = records.filter((record) => record.origin === "sandbox");
  await assertSelection(page, sandbox);
  await page
    .getByRole("button", { name: "Restore layout", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved layout restored" }),
  ).toBeVisible();
  await expect(charts).toHaveCount(2);
  await expect(
    page.getByLabel("Purchase evidence", { exact: true }),
  ).toHaveValue("sandbox");
  await assertSelection(page, sandbox);
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        pages: {
          purchases: {
            "unknown-widget": { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 10 },
          },
        },
      }),
    );
  }, stored!.key);
  await page
    .getByRole("button", { name: "Restore layout", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "No valid saved layout" }),
  ).toBeVisible();
  await expect(charts).toHaveCount(2);
  await assertSelection(page, sandbox);
});

test("native Insights and the unified assistant support keyboard, reduced motion, 320px reflow and axe checks", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const records = await openWorkspace(page);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const sources = sourceSummary(page);
  const disclosure = sources.locator(":scope > summary");
  await disclosure.focus();
  await disclosure.press("Enter");
  await expect(disclosure).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sources.getByRole("link").first()).toBeFocused();
  for (const appearance of ["dark", "light", "system"]) {
    await page
      .getByRole("combobox", { name: "Appearance" })
      .selectOption(appearance);
    await assertSelection(page, records);
  }
  for (const size of ["100%", "200%"]) {
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = value;
    }, size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const box = await page.getByTestId("customer-studio").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(320);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const launcher = page.getByRole("button", {
    name: "Ask CareOS",
    exact: true,
  });
  await launcher.focus();
  await launcher.press("Enter");
  const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Your purchases · Personal Insights");
  await expect(
    dialog.getByLabel("Ask about your purchase", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(launcher).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
