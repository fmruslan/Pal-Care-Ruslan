import {
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  CareContext,
  CareTurn,
  Conversation,
  TurnInput,
} from "../../src/lib/careos/contracts";

// Checkpoint 1A only. The standard E2E server uses fictional saved records and
// fixture assistance; this is not genuine-model, financial or real-device proof.
// Keep these literal names independent of the implementation's suggestion list.
const suggestions = [
  "What did I buy in the last three months?",
  "Show my recorded purchase totals.",
  "Find purchases with receipts.",
  "Help me care for a product.",
];
const headphoneId = "00000000-0000-4000-8000-000000000201";
const headphone = `/vault/${headphoneId}`;
const receipt = "/documents/00000000-0000-4000-8000-000000000301";
const headphoneChoice =
  "Everyday headphones · F-01 Oct 18, 2026 · Sample · PC-000201";
const headphoneContext: CareContext = {
  twinId: headphoneId,
  name: "Everyday headphones",
  model: "F-01",
  origin: "sample",
  purchasedOn: "2026-10-18",
};

function injectedTurn(
  requestId: string,
  message: string,
  text: string,
): CareTurn {
  return {
    requestId,
    message,
    answer: {
      outcome: "answered",
      mode: "deterministic",
      context: headphoneContext,
      revision: 1,
      text,
      steps: [],
      sources: [],
      actions: [{ label: "Open receipt", href: receipt }],
    },
  };
}

const test = base.extend<{ presentationSafety: void }>({
  presentationSafety: [
    async ({ page }, use) => {
      const prohibited: string[] = [];
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const financial = /^\/api\/(?:checkout|operator)(?:\/|$)/.test(
          url.pathname,
        );
        const externalProvider =
          /(^|\.)(paypal\.com|openai\.com|chatgpt\.com|channel3\.ai)$/.test(
            url.hostname,
          );
        if (financial || externalProvider) {
          prohibited.push(`${request.method()} ${url.origin}${url.pathname}`);
          await route.abort("blockedbyclient");
        } else await route.continue();
      });
      await use(undefined);
      expect(
        prohibited,
        "Presentation cannot grant financial/provider authority",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
test.describe.configure({ timeout: 60_000 });

function requestLog(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.push(`${request.method()} ${path}`);
  });
  return {
    requests,
    mutations: () =>
      requests.filter((entry) => !/^(GET|HEAD|OPTIONS) /.test(entry)),
    bootstraps: () =>
      requests.filter((entry) => entry === "POST /api/careos/conversations"),
    modelWork: () =>
      requests.filter((entry) => /^POST .*(?:\/turns|\/plan)$/.test(entry)),
  };
}

async function openNorth(page: Page) {
  const launcher = page.getByRole("button", {
    name: "Ask North Star",
    exact: true,
  });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Working… your next draft is kept.", { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  return {
    dialog,
    composer: dialog.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
    transcript: dialog.getByRole("region", {
      name: "North Star conversation",
      exact: true,
    }),
  };
}

async function chooseHeadphones(page: Page, dialog: Locator) {
  const lookup = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/careos/context" &&
      response.request().method() === "GET",
  );
  await dialog.getByRole("button", { name: "Change", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Purchase context",
    exact: true,
  });
  expect((await lookup).ok()).toBe(true);
  await picker
    .getByRole("textbox", { name: "Search saved purchases", exact: true })
    .fill("2026-10-18");
  const focusColor = await picker.evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--intelligence-foreground)";
    node.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(
    picker.getByRole("textbox", {
      name: "Search saved purchases",
      exact: true,
    }),
  ).toHaveCSS("outline-color", focusColor);
  await picker
    .getByRole("button", { name: headphoneChoice, exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
}

async function sendCare(page: Page, dialog: Locator, message: string) {
  const result = page.waitForResponse(
    (response) =>
      /\/api\/careos\/conversations\/[^/]+\/turns$/.test(
        new URL(response.url()).pathname,
      ) && response.request().method() === "POST",
  );
  await dialog
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill(message);
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const response = await result;
  expect(response.ok()).toBe(true);
  const turn = (await response.json()) as CareTurn;
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(
    dialog.locator(`[data-request-id="${turn.requestId}"] [data-user-message]`),
  ).toHaveText(message);
  return turn;
}

async function navigate(page: Page, label: string, path: string) {
  const close = page.getByRole("button", {
    name: "Close North Star",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  const navigation = page.getByRole("navigation", {
    name:
      page.viewportSize()!.width < 1024
        ? "Mobile navigation"
        : "Main navigation",
  });
  await navigation.getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("new North conversation exposes exactly four optional, honest discovery shortcuts and no automatic question", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/dashboard");
  const { dialog, composer } = await openNorth(page);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "No purchase selected",
  );
  const discovery = dialog.locator("[data-north-discovery]");
  await expect(discovery.getByRole("button")).toHaveText(suggestions);
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: /^(Find receipt|Product care|Summary)$/,
    }),
  ).toHaveCount(0);
  const before = log.mutations();
  for (const name of suggestions.slice(0, 3)) {
    await discovery.getByRole("button", { name, exact: true }).click();
    await expect(
      dialog
        .getByRole("status")
        .filter({ hasText: "coming in the next checkpoints" }),
    ).toContainText("Nothing was sent");
    await expect(discovery.getByRole("button")).toHaveText(suggestions);
    await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
    await expect(composer).toHaveValue("");
    expect(log.mutations()).toEqual(before);
  }
  await discovery
    .getByRole("button", { name: suggestions[3], exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Purchase context",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(composer).toBeEditable();
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  expect(log.mutations()).toEqual(before);
  expect(log.modelWork()).toEqual([]);
  await chooseHeadphones(page, dialog);
  await composer.fill("Keep my existing unsent question");
  await discovery
    .getByRole("button", { name: suggestions[3], exact: true })
    .click();
  await expect(composer).toHaveValue("Keep my existing unsent question");
  await expect(composer).toBeFocused();
  expect(log.mutations()).toEqual(before);
  await composer.fill("");
  await discovery
    .getByRole("button", { name: suggestions[3], exact: true })
    .click();
  await expect(composer).toHaveValue("Help me care for this product.");
  await expect(composer).toBeFocused();
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  expect(log.mutations()).toEqual(before);
  await sendCare(page, dialog, "What does North Star do?");
  await expect(discovery).toHaveCount(0);
});

for (const retirement of ["dismiss", "change context"] as const) {
  test(`a clarification retired by ${retirement} stays historical after reload without replay`, async ({
    page,
  }) => {
    const log = requestLog(page);
    await page.goto("/dashboard");
    const { dialog, composer } = await openNorth(page);
    const turn = await sendCare(page, dialog, "Find receipt");
    expect(turn.answer.outcome).toBe("selection");
    const choice = dialog.getByRole("region", {
      name: "Choose a purchase",
      exact: true,
    });
    await expect(choice).toBeVisible();
    if (retirement === "dismiss")
      await choice
        .getByRole("button", { name: "Dismiss", exact: true })
        .click();
    else await chooseHeadphones(page, dialog);
    await expect(choice).toHaveCount(0);
    await composer.fill("Keep my replacement draft");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem("palcare-careos-interaction-v1")!)
              .dismissed,
        ),
      )
      .toContain(turn.requestId);
    const before = log.mutations();
    await page.reload();
    await openNorth(page);
    await expect(
      dialog.locator(`[data-request-id="${turn.requestId}"]`),
    ).toContainText("Purchase choice closed.");
    await expect(choice).toHaveCount(0);
    await expect(composer).toHaveValue("Keep my replacement draft");
    expect(log.mutations()).toEqual(before);
  });
}

test("North identity uses a silent outlined star, neutral shell and violet accessible controls in each appearance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const { dialog, composer, transcript } = await openNorth(page);
  const heading = dialog.getByRole("heading", {
    name: "North Star",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAccessibleName("North Star");
  await expect(heading.locator('svg[aria-hidden="true"]')).toHaveAttribute(
    "fill",
    "none",
  );
  await expect(dialog.getByText(/powered by/i)).toHaveCount(0);
  await expect(page.locator("body")).toContainText("Pal Care");
  await expect(transcript).toHaveCount(1);
  const colors = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    const rgb = (hex: string) => {
      const raw = hex.trim().slice(1);
      const value =
        raw.length === 3
          ? [...raw].map((digit) => digit.repeat(2)).join("")
          : raw;
      return `rgb(${[0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).join(", ")})`;
    };
    return {
      card: rgb(style.getPropertyValue("--card")),
      violet: rgb(style.getPropertyValue("--intelligence-foreground")),
      bronze: style.getPropertyValue("--brand").trim(),
    };
  });
  expect(colors.bronze).toBe("#b8733a");
  await expect(dialog.locator(".careos-header")).toHaveCSS(
    "background-color",
    colors.card,
  );
  await expect(heading).toHaveCSS("color", colors.violet);
  await composer.focus();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveCSS("outline-color", colors.violet);
  await expect(composer).toHaveCSS("outline-style", "solid");
  await expect(
    dialog.getByRole("button", {
      name: "Clear conversation history",
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog
    .locator('summary[aria-label="North Star options"]')
    .press("Enter");
  await expect(
    dialog.getByRole("button", {
      name: "Clear conversation history",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "Clearing never resets usage or removes purchases.",
  );
  const accessibility = await new AxeBuilder({ page })
    .include(".careos-assistant")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog
    .locator('summary[aria-label="North Star options"]')
    .press("Enter");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ask North Star", exact: true }),
  ).toBeFocused();
});

test("cancel an accidental searchable context picker without messages, navigation or history loss", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/dashboard");
  const { dialog, composer } = await openNorth(page);
  const turn = await sendCare(page, dialog, "What does North Star do?");
  await composer.fill("Keep this question while I look");
  const before = log.mutations();
  await dialog.getByRole("button", { name: "Change", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Purchase context",
    exact: true,
  });
  await picker
    .getByRole("textbox", { name: "Search saved purchases", exact: true })
    .fill("no-such-saved-product");
  await expect(picker.getByRole("status")).toHaveText(
    "No matching saved purchases.",
  );
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Change", exact: true }),
  ).toBeFocused();
  await expect(composer).toHaveValue("Keep this question while I look");
  await expect(dialog.locator("[data-user-message]")).toHaveText(turn.message);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "No purchase selected",
  );
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(log.mutations()).toEqual(before);
  await dialog.getByRole("button", { name: "Change", exact: true }).click();
  await expect(
    picker.getByRole("textbox", {
      name: "Search saved purchases",
      exact: true,
    }),
  ).toBeFocused();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Change", exact: true }),
  ).toBeFocused();
  await expect(composer).toHaveValue("Keep this question while I look");
  await expect(dialog.locator("[data-user-message]")).toHaveText(turn.message);
  expect(log.mutations()).toEqual(before);
});

test("explicitly choosing the identical implicit purchase persists across another product's page and reload", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto(headphone);
  const { dialog, composer } = await openNorth(page);
  await composer.fill("Retain this draft after choosing the same context");
  const storedContext = () =>
    page.evaluate(() => {
      const raw = sessionStorage.getItem("palcare-careos-interaction-v1");
      return raw
        ? (JSON.parse(raw) as { explicit: boolean; context: unknown })
        : null;
    });
  await expect.poll(async () => (await storedContext())?.explicit).toBe(false);
  const implicit = (await storedContext())!.context;
  const before = log.mutations();
  await chooseHeadphones(page, dialog);
  await expect.poll(async () => (await storedContext())?.explicit).toBe(true);
  expect((await storedContext())!.context).toEqual(implicit);
  await dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Back to purchase vault", exact: true })
    .click();
  await page
    .getByRole("link", { name: "View details for Raspberry Pi 5", exact: true })
    .click();
  await openNorth(page);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  await expect(composer).toHaveValue(
    "Retain this draft after choosing the same context",
  );
  await page.reload();
  await openNorth(page);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  await expect(composer).toHaveValue(
    "Retain this draft after choosing the same context",
  );
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  expect(log.mutations()).toEqual(before);
});

test("search and directly change/remove persistent purchase context without submitting or navigating", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/dashboard");
  const { dialog, composer } = await openNorth(page);
  const prior = await sendCare(page, dialog, "What does North Star do?");
  await composer.fill("A draft that context controls cannot consume");
  const before = log.mutations();
  await chooseHeadphones(page, dialog);
  await expect(dialog.locator(".careos-context")).toContainText("Oct 18, 2026");
  await expect(dialog.locator(".careos-context")).toContainText(
    "Sample purchase",
  );
  await expect(composer).toHaveValue(
    "A draft that context controls cannot consume",
  );
  await expect(dialog.getByRole("button", { name: /continue/i })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(log.requests).toContain("GET /api/careos/context");
  expect(log.mutations()).toEqual(before);
  await dialog
    .getByRole("button", { name: "Remove purchase context", exact: true })
    .click();
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "No purchase selected",
  );
  await expect(composer).toHaveValue(
    "A draft that context controls cannot consume",
  );
  await expect(dialog.locator("[data-user-message]")).toHaveText(prior.message);
  await expect(
    dialog.locator(
      `[data-request-id="${prior.requestId}"] [data-answer-scope]`,
    ),
  ).toHaveText("Question scope: no purchase used");
  expect(log.mutations()).toEqual(before);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a library question is honestly guarded, never a selected item's price, and keeps exact product context for care", async ({
  page,
}) => {
  await page.goto(headphone);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  for (const question of [
    "What did I buy in the last three months?",
    "Show my recorded purchase totals.",
    "Find purchases with receipts.",
  ]) {
    const turn = await sendCare(page, dialog, question);
    expect(turn.answer.outcome).toBe("unsupported");
    expect(turn.answer.mode).toBe("deterministic");
    expect(turn.answer.questionScope).toBe("library");
    expect(turn.answer.context).toBeNull();
    expect(turn.answer.text).toContain("coming in the next checkpoints");
    expect(turn.answer.text).not.toMatch(/\$\s*129|129\.00/);
    expect(turn.answer.purchaseChoices).toBeUndefined();
    await expect(dialog.locator(".careos-context strong")).toHaveText(
      "Everyday headphones · F-01",
    );
    await expect(
      dialog.locator(
        `[data-request-id="${turn.requestId}"] [data-answer-scope]`,
      ),
    ).toContainText("all saved purchases · answer not yet supported");
    await expect(
      dialog.getByRole("region", { name: "Choose a purchase", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(headphone);
  }
  const productTurn = await sendCare(page, dialog, "Find receipt");
  expect(productTurn.answer.context?.twinId).toBe(headphoneId);
  await expect(
    dialog
      .locator("[data-latest-answer]")
      .getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveAttribute("href", receipt);
  // Earlier library answers keep their scope after another product answer.
  await expect(
    dialog
      .locator("[data-answer-scope]")
      .filter({ hasText: "all saved purchases" }),
  ).toHaveCount(3);
});

test("one timeline and draft survive customer navigation, Insights and return, close/reopen and expansion without extra work", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/dashboard");
  let opened = await openNorth(page);
  await chooseHeadphones(page, opened.dialog);
  const care = await sendCare(page, opened.dialog, "Find receipt");
  await opened.composer.fill("Keep this cross-page draft");
  for (const [label, path] of [
    ["Purchases", "/vault"],
    ["Documents", "/documents"],
    ["Insights", "/insights"],
  ]) {
    await navigate(page, label, path);
    if (path === "/insights")
      await expect(page.getByTestId("insight-documents-care")).toBeVisible({
        timeout: 20_000,
      });
    opened = await openNorth(page);
    await expect(opened.composer).toHaveValue("Keep this cross-page draft");
    await expect(opened.dialog.locator("[data-user-message]")).toHaveText(
      care.message,
    );
    await expect(opened.dialog.locator(".careos-context strong")).toHaveText(
      "Everyday headphones · F-01",
    );
    await expect(
      opened.dialog.getByRole("link", { name: "Open receipt", exact: true }),
    ).toHaveAttribute("href", receipt);
  }
  await opened.composer.fill("Show my purchases by category");
  await opened.dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(opened.dialog.locator("[data-pending-question]")).toHaveCount(
    0,
    { timeout: 20_000 },
  );
  await expect(opened.dialog.locator("[data-latest-answer]")).toContainText(
    "dashboard state was checked",
  );
  await expect(opened.dialog.locator("[data-user-message]")).toHaveText([
    care.message,
    "Show my purchases by category",
  ]);
  const scopes = await opened.dialog
    .locator("[data-answer-scope]")
    .allTextContents();
  const identities = await opened.dialog
    .locator("article[data-request-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-request-id")),
    );
  expect(new Set(identities).size).toBe(2);
  await opened.composer.fill("Retain this after the Insights answer");
  const mutations = log.mutations();
  const bootstraps = log.bootstraps();
  const modelWork = log.modelWork();
  const url = page.url();
  await opened.dialog
    .getByRole("button", { name: "Expand assistant", exact: true })
    .click();
  await expect(opened.dialog).toHaveClass(/careos-expanded/);
  await expect(opened.composer).toHaveValue(
    "Retain this after the Insights answer",
  );
  await expect(opened.dialog.locator("[data-answer-scope]")).toHaveText(scopes);
  await opened.dialog
    .getByRole("button", { name: "Compact assistant", exact: true })
    .click();
  await opened.dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  opened = await openNorth(page);
  expect(page.url()).toBe(url);
  expect(log.mutations()).toEqual(mutations);
  expect(log.bootstraps()).toEqual(bootstraps);
  expect(log.modelWork()).toEqual(modelWork);
  await navigate(page, "Home", "/dashboard");
  opened = await openNorth(page);
  await expect(opened.composer).toHaveValue(
    "Retain this after the Insights answer",
  );
  await expect(opened.dialog.locator("[data-user-message]")).toHaveText([
    care.message,
    "Show my purchases by category",
  ]);
  await expect(opened.dialog.locator("[data-answer-scope]")).toHaveText(scopes);
  expect(
    await opened.dialog
      .locator("article[data-request-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-request-id")),
      ),
  ).toEqual(identities);
  await expect(opened.dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  expect(log.mutations()).toEqual(mutations);
  expect(log.bootstraps()).toHaveLength(1);
});

test("Insights routes library guards and exact-product receipt/amount questions without losing persistent context", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/insights");
  await expect(page.getByTestId("insight-documents-care")).toBeVisible({
    timeout: 20_000,
  });
  const { dialog, composer } = await openNorth(page);
  await chooseHeadphones(page, dialog);
  await composer.fill("Find purchases with receipts.");
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    "Find purchases with receipts.",
  );
  const library = dialog.locator("article[data-request-id]").last();
  await expect(library).toContainText("coming in the next checkpoints");
  await expect(library).toContainText("From saved records · no model call");
  await expect(library.locator("[data-answer-scope]")).toContainText(
    "all saved purchases · answer not yet supported",
  );
  const libraryId = await library.getAttribute("data-request-id");
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  const productReceipt = await sendCare(page, dialog, "Find receipt");
  expect(productReceipt.answer.context?.twinId).toBe(headphoneId);
  await expect(
    dialog
      .locator("[data-latest-answer]")
      .getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveAttribute("href", receipt);
  const amount = await sendCare(
    page,
    dialog,
    "How much did this purchase cost?",
  );
  expect(amount.answer.outcome).toBe("answered");
  expect(amount.answer.mode).toBe("deterministic");
  expect(amount.answer.context?.twinId).toBe(headphoneId);
  expect(amount.answer.questionScope).not.toBe("library");
  expect(amount.answer.text).toContain("$149.00");
  expect(amount.answer.text).not.toContain("$129.00");
  await expect(
    dialog.locator(`[data-request-id="${libraryId}"] [data-answer-scope]`),
  ).toContainText("all saved purchases · answer not yet supported");
  expect(
    log.requests.filter((entry) => entry.startsWith("POST /api/intelligence/")),
  ).toEqual([]);
  await expect(page).toHaveURL(/\/insights$/);
});

test("reload merges care and completed Insights IDs using their owned GETs, preserving order without replay or auto-application (injected transport)", async ({
  page,
}) => {
  const log = requestLog(page);
  const careId = "00000000-0000-4000-8000-000000008101";
  const planId = "00000000-0000-4000-8000-000000008102";
  const plannedQuestion = "Show my documents";
  const first = injectedTurn(
    "00000000-0000-4000-8000-000000008103",
    "Earlier saved receipt question",
    "Injected earlier receipt evidence.",
  );
  const last = injectedTurn(
    "00000000-0000-4000-8000-000000008105",
    "Later saved care question",
    "Injected later care evidence.",
  );
  const planned = injectedTurn(
    "00000000-0000-4000-8000-000000008104",
    JSON.stringify({ scope: "customer-studio", message: plannedQuestion }),
    "Injected old execution claim must not be restored as current success.",
  );
  planned.answer.context = null;
  planned.answer.customerPresentation = {
    outcome: "apply",
    commands: [{ operation: "documents" }],
  };
  const care: Conversation = {
    id: careId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    turns: [first, last],
  };
  const plans: Conversation = {
    id: planId,
    expiresAt: care.expiresAt,
    turns: [planned],
  };
  await page.route("**/api/careos/conversations**", async (route) => {
    if (
      route.request().method() === "GET" &&
      new URL(route.request().url()).pathname.endsWith(`/${careId}`)
    )
      await route.fulfill({ json: care });
    else
      await route.fulfill({
        status: 503,
        json: { error: "injected_unexpected_mutation" },
      });
  });
  await page.route("**/api/intelligence/customer/plan**", async (route) => {
    const request = route.request();
    if (
      request.method() === "GET" &&
      new URL(request.url()).searchParams.get("conversationId") === planId
    )
      await route.fulfill({ json: plans });
    else if (request.method() === "GET")
      await route.fulfill({
        status: 403,
        json: { error: "careos_scope_denied" },
      });
    else
      await route.fulfill({
        status: 503,
        json: { error: "injected_unexpected_mutation" },
      });
  });
  await page.goto("/insights");
  await page.evaluate(
    ({ careId, planId, order, context }) => {
      sessionStorage.setItem("palcare-careos-conversation", careId);
      sessionStorage.setItem(
        "palcare-insights-history-v1",
        JSON.stringify([
          {
            conversationId: planId,
            requestId: order[1],
            createdAt: Date.now(),
          },
        ]),
      );
      sessionStorage.setItem(
        "palcare-careos-interaction-v1",
        JSON.stringify({
          version: 1,
          context,
          explicit: true,
          order,
          draft: "Keep this draft through history reload",
          savedAt: Date.now(),
        }),
      );
    },
    {
      careId,
      planId,
      order: [first.requestId, planned.requestId, last.requestId],
      context: headphoneContext,
    },
  );
  for (let reload = 0; reload < 2; reload++) {
    const beforeReads = log.requests.filter(
      (entry) => entry === "GET /api/intelligence/customer/plan",
    ).length;
    await page.reload();
    await expect(page.getByTestId("insight-documents-care")).toBeVisible({
      timeout: 20_000,
    });
    const { dialog, composer } = await openNorth(page);
    await expect(dialog.locator("[data-user-message]")).toHaveText([
      first.message,
      plannedQuestion,
      last.message,
    ]);
    const recovered = dialog.locator(
      `[data-request-id="${planned.requestId}"]`,
    );
    await expect(recovered).toContainText(
      "Its earlier browser execution has not been re-verified after reload",
    );
    await expect(recovered).not.toContainText("Injected old execution claim");
    await expect(
      dialog.getByRole("button", { name: "Apply saved view", exact: true }),
    ).toHaveCount(0);
    await expect(composer).toHaveValue(
      "Keep this draft through history reload",
    );
    await expect(dialog.locator(".careos-context strong")).toHaveText(
      "Everyday headphones · F-01",
    );
    await expect(dialog.locator("article[data-request-id]")).toHaveCount(3);
    expect(
      log.requests.filter(
        (entry) => entry === "GET /api/intelligence/customer/plan",
      ).length,
    ).toBeGreaterThan(beforeReads);
    expect(log.mutations()).toEqual([]);
    await dialog
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "My Purchases", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const tools = page.getByTestId("customer-studio-tools");
    await expect(tools).toHaveCount(0);
  }
  // A denied conversation before an available one must not erase available
  // history. The browser's ID index never supplies private transcript content.
  const deniedPlanId = "00000000-0000-4000-8000-000000008106";
  const deniedRequestId = "00000000-0000-4000-8000-000000008107";
  await page.evaluate(
    ({ deniedPlanId, deniedRequestId }) => {
      const available = JSON.parse(
        sessionStorage.getItem("palcare-insights-history-v1")!,
      );
      sessionStorage.setItem(
        "palcare-insights-history-v1",
        JSON.stringify([
          {
            conversationId: deniedPlanId,
            requestId: deniedRequestId,
            createdAt: Date.now(),
          },
          ...available,
        ]),
      );
    },
    { deniedPlanId, deniedRequestId },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  const denied = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(denied.getByRole("alert")).toContainText(
    "Some saved Insights history is unavailable. Available entries were restored",
  );
  await expect(denied.locator("[data-user-message]")).toHaveText([
    first.message,
    plannedQuestion,
    last.message,
  ]);
  await expect(
    denied.locator(`[data-request-id="${deniedRequestId}"]`),
  ).toHaveCount(0);
  await expect(
    denied.locator(`[data-request-id="${planned.requestId}"]`),
  ).toContainText(
    "Its earlier browser execution has not been re-verified after reload",
  );
  await expect(
    denied.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
  ).toHaveValue("Keep this draft through history reload");
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("palcare-insights-history-v1")!),
    ),
  ).toEqual([
    expect.objectContaining({
      conversationId: deniedPlanId,
      requestId: deniedRequestId,
    }),
    expect.objectContaining({
      conversationId: planId,
      requestId: planned.requestId,
    }),
  ]);
  expect(planned.message).toBe(
    JSON.stringify({ scope: "customer-studio", message: plannedQuestion }),
  );
  expect(log.mutations()).toEqual([]);
});

test("an uncertain Insights plan blocks new sends until GET recovery, then offers a return link and allows unrelated care off-route (injected transport)", async ({
  page,
}) => {
  const log = requestLog(page);
  const careId = "00000000-0000-4000-8000-000000008201";
  const planId = "00000000-0000-4000-8000-000000008202";
  const requestId = "00000000-0000-4000-8000-000000008203";
  const care: Conversation = {
    id: careId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    turns: [],
  };
  const planned = injectedTurn(
    requestId,
    "Show my documents",
    "Injected saved plan, not actual model/SDK acceptance.",
  );
  planned.answer.context = null;
  planned.answer.customerPresentation = {
    outcome: "apply",
    commands: [{ operation: "documents" }],
  };
  const inputs: TurnInput[] = [];
  await page.route("**/api/careos/conversations**", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith(`/${careId}/turns`)
    ) {
      const input = request.postDataJSON() as TurnInput;
      inputs.push(input);
      const turn = injectedTurn(
        input.requestId,
        input.message,
        "Injected receipt after recovery; no model call.",
      );
      turn.answer.revision = input.revision;
      care.turns.push(turn);
      await route.fulfill({ json: turn });
    } else if (request.method() === "GET") await route.fulfill({ json: care });
    else
      await route.fulfill({
        status: 503,
        json: { error: "injected_unexpected_mutation" },
      });
  });
  await page.route("**/api/intelligence/customer/plan**", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        json: {
          id: planId,
          expiresAt: care.expiresAt,
          turns: [planned],
        } satisfies Conversation,
      });
    else
      await route.fulfill({
        status: 503,
        json: { error: "injected_unexpected_mutation" },
      });
  });
  await page.goto("/dashboard");
  await page.evaluate(
    ({ careId, planId, requestId, context }) => {
      sessionStorage.setItem("palcare-careos-conversation", careId);
      sessionStorage.setItem(
        "palcare-insights-pending-v1",
        JSON.stringify({
          requestId,
          conversationId: planId,
          message: "Show my documents",
          createdAt: Date.now(),
        }),
      );
      sessionStorage.setItem(
        "palcare-careos-interaction-v1",
        JSON.stringify({
          version: 1,
          context,
          explicit: true,
          draft: "Find receipt",
          order: [requestId],
          savedAt: Date.now(),
        }),
      );
    },
    { careId, planId, requestId, context: headphoneContext },
  );
  await page.reload();
  const { dialog, composer } = await openNorth(page);
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    requestId,
  );
  await expect(
    dialog.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeDisabled();
  await composer.press("Enter");
  await dialog
    .locator("form")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(inputs).toEqual([]);
  expect(log.mutations()).toEqual([]);
  await dialog
    .getByRole("button", { name: "Check for saved answer", exact: true })
    .click();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(
    dialog.getByRole("link", {
      name: "Return to Insights to apply saved view",
      exact: true,
    }),
  ).toHaveAttribute("href", "/insights");
  await expect(
    dialog.getByRole("button", { name: "Apply saved view", exact: true }),
  ).toHaveCount(0);
  await expect(composer).toHaveValue("Find receipt");
  const answered = await sendCare(page, dialog, "Find receipt");
  expect(answered.requestId).not.toBe(requestId);
  expect(inputs).toHaveLength(1);
  expect(inputs[0].twinId).toBe(headphoneId);
  expect(
    log.requests.filter((entry) => entry.startsWith("POST /api/intelligence/")),
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("palcare-insights-pending-v1")!),
    ),
  ).toMatchObject({
    requestId,
    conversationId: planId,
    message: planned.message,
  });
  await expect(
    dialog.getByRole("link", {
      name: "Return to Insights to apply saved view",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
