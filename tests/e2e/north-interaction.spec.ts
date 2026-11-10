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

// Integrated main-content regression. The E2E server uses fictional saved records and
// fixture assistance; this is not genuine-model, financial or real-device proof.
const headphoneId = "00000000-0000-4000-8000-000000000201";
const headphone = `/vault/${headphoneId}`;
const receipt = "/documents/00000000-0000-4000-8000-000000000301";
const headphoneChoice =
  "Everyday headphones · F-01 Oct 18, 2026 · Example purchase · PC-000201";
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

async function openNorth(page: Page, expectedAlert?: string) {
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
  const launcher = page.getByRole("button", {
    name: "Ask North Star",
    exact: true,
  });
  if (!restoreOpen && !(await dialog.isVisible())) {
    // Home's star submits the unified field; History is the read-only opener
    // when a retained draft is present. Neither restore nor history can replay.
    if (
      ["/dashboard", "/purchases", "/documents"].includes(
        new URL(page.url()).pathname,
      )
    ) {
      await page.getByRole("button", { name: "History", exact: true }).click();
      await dialog
        .getByRole("button", { name: "History", exact: true })
        .click();
    } else await launcher.click();
  }
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "Working on your question. You can keep writing your next one.",
      { exact: true },
    ),
  ).toHaveCount(0);
  if (expectedAlert) {
    await expect(dialog.getByRole("alert")).toHaveCount(1);
    await expect(dialog.getByRole("alert")).toContainText(expectedAlert);
  } else await expect(dialog.getByRole("alert")).toHaveCount(0);
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
  await dialog
    .getByRole("button", { name: "Choose purchase", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choose a purchase",
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
  // Radix restores focus after unmount, not necessarily before picker removal.
  // Observe that handoff before another control deliberately takes focus.
  await expect(
    dialog.getByRole("button", { name: "Choose purchase", exact: true }),
  ).toBeFocused();
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
}

async function selectHistory(
  dialog: Locator,
  message: string,
  requestId: string,
) {
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  const history = dialog.getByRole("region", {
    name: "Previous North results",
    exact: true,
  });
  await history.getByRole("button", { name: message, exact: true }).click();
  await expect(dialog.locator("[data-user-message]")).toHaveText(message);
  await expect(dialog.locator("article[data-request-id]")).toHaveCount(1);
  await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
    "data-request-id",
    requestId,
  );
}

async function sendCare(page: Page, dialog: Locator, message: string) {
  const result = page.waitForResponse(
    (response) =>
      /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/turns$/.test(
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
    name: "Main navigation",
    exact: true,
  });
  await navigation
    .getByRole("link", {
      name: label === "All documents" ? "Purchases" : label,
      exact: true,
    })
    .click();
  if (label === "All documents")
    await page
      .getByRole("link", { name: "All documents", exact: true })
      .click();
  await expect(page).toHaveURL(
    (url) => `${url.pathname}${url.search}` === path,
  );
}

test("new inline North opens with library context and an editable draft but no automatic question", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/purchases");
  const { dialog, composer } = await openNorth(page);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "All saved purchases",
  );
  await expect(dialog).toHaveAttribute("aria-modal", "false");
  expect(await dialog.evaluate((node) => !!node.closest("#main-content"))).toBe(
    true,
  );
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: /^(Find receipt|Product care|Summary)$/,
    }),
  ).toHaveCount(0);
  const before = log.mutations();
  for (const name of [
    "What did I buy in the last three months?",
    "Show my recorded purchase totals.",
    "Find purchases with receipts.",
  ]) {
    await composer.fill(name);
    await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
    await expect(composer).toHaveValue(name);
    expect(log.mutations()).toEqual(before);
  }
  await composer.fill("Keep my existing unsent question");
  await dialog
    .getByRole("button", { name: "Choose purchase", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choose a purchase",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Choose purchase", exact: true }),
  ).toBeFocused();
  await expect(composer).toBeEditable();
  await expect(dialog.locator("[data-user-message]")).toHaveCount(0);
  expect(log.mutations()).toEqual(before);
  expect(log.modelWork()).toEqual([]);
  await chooseHeadphones(page, dialog);
  await composer.fill("Keep my existing unsent question");
  await expect(composer).toHaveValue("Keep my existing unsent question");
  await expect(composer).toBeFocused();
  expect(log.mutations()).toEqual(before);
  await sendCare(page, dialog, "What does North Star do?");
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    "What does North Star do?",
  );
});

for (const retirement of ["dismiss", "change context"] as const) {
  test(`a clarification retired by ${retirement} stays historical after reload without replay`, async ({
    page,
  }) => {
    const log = requestLog(page);
    await page.goto("/purchases");
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
    ).toContainText("These choices are closed.");
    await expect(choice).toHaveCount(0);
    await expect(composer).toHaveValue("Keep my replacement draft");
    expect(log.mutations()).toEqual(before);
  });
}

test("North identity uses a silent outlined star, neutral shell and violet accessible controls in each appearance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/purchases");
  const { dialog, composer, transcript } = await openNorth(page);
  const heading = dialog.locator("header > div").first();
  await expect(heading).toBeVisible();
  await expect(dialog).toHaveAccessibleName("North Star");
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
  await expect(dialog).toHaveAttribute("aria-modal", "false");
  await expect(heading).toHaveCSS("color", colors.violet);
  await composer.focus();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveCSS("outline-style", "solid");
  await expect(composer).toHaveCSS("outline-width", "2px");
  await expect(composer).toHaveCSS("outline-offset", "2px");
  await expect(composer).toHaveCSS("outline-color", colors.violet);
  await expect(
    dialog.getByRole("button", {
      name: "Clear conversation history",
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await dialog
    .getByText("Conversation settings", { exact: true })
    .press("Enter");
  await expect(
    dialog.getByRole("button", {
      name: "Clear conversation history",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "Clearing history keeps your purchases and doesn’t restore your AI allowance.",
  );
  const accessibility = await new AxeBuilder({ page })
    .include(".careos-assistant")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ask North Star", exact: true }),
  ).toBeFocused();
});

test("cancel an accidental searchable context picker without messages, navigation or history loss", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/purchases");
  const { dialog, composer } = await openNorth(page);
  const turn = await sendCare(page, dialog, "What does North Star do?");
  await composer.fill("Keep this question while I look");
  const before = log.mutations();
  await dialog
    .getByRole("button", { name: "Choose purchase", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choose a purchase",
    exact: true,
  });
  await picker
    .getByRole("textbox", { name: "Search saved purchases", exact: true })
    .fill("no-such-saved-product");
  await expect(picker.getByRole("status")).toHaveText(
    "No saved purchases match. Try a product name, model or date.",
  );
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Choose purchase", exact: true }),
  ).toBeFocused();
  await expect(composer).toHaveValue("Keep this question while I look");
  await expect(dialog.locator("[data-user-message]")).toHaveText(turn.message);
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "All saved purchases",
  );
  await expect(page).toHaveURL(/\/purchases$/);
  expect(log.mutations()).toEqual(before);
  await dialog
    .getByRole("button", { name: "Choose purchase", exact: true })
    .click();
  await expect(
    picker.getByRole("textbox", {
      name: "Search saved purchases",
      exact: true,
    }),
  ).toBeFocused();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Choose purchase", exact: true }),
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
    .getByRole("link", { name: "Back to Purchases", exact: true })
    .click();
  await page
    .getByRole("link", { name: /^View details for Raspberry Pi 5,/ })
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
  await page.goto("/purchases");
  const { dialog, composer } = await openNorth(page);
  const prior = await sendCare(page, dialog, "What does North Star do?");
  await composer.fill("A draft that context controls cannot consume");
  const before = log.mutations();
  await chooseHeadphones(page, dialog);
  await expect(dialog.locator(".careos-context")).toContainText("Oct 18, 2026");
  await expect(dialog.locator(".careos-context")).toContainText(
    "Example purchase",
  );
  await expect(composer).toHaveValue(
    "A draft that context controls cannot consume",
  );
  await expect(dialog.getByRole("button", { name: /continue/i })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/\/purchases$/);
  expect(log.requests).toContain("GET /api/careos/context");
  expect(log.mutations()).toEqual(before);
  await dialog
    .getByRole("button", { name: "Remove purchase context", exact: true })
    .click();
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "All saved purchases",
  );
  await expect(composer).toHaveValue(
    "A draft that context controls cannot consume",
  );
  await expect(dialog.locator("[data-user-message]")).toHaveText(prior.message);
  expect(prior.answer.context).toBeNull();
  expect(prior.answer.questionScope).not.toBe("library");
  const priorAnswer = dialog.locator(`[data-request-id="${prior.requestId}"]`);
  await expect(priorAnswer).toHaveAttribute(
    "data-answer-mode",
    prior.answer.mode,
  );
  await expect(priorAnswer.locator("[data-answer-scope]")).toHaveCount(0);
  expect(log.mutations()).toEqual(before);
  await expect(page).toHaveURL(/\/purchases$/);
});

test("a supported library query returns computed records, never a selected item's price, and keeps exact context for care", async ({
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
  const libraryQuestions = [
    "What did I buy in the last three months?",
    "Show my recorded purchase totals.",
    "Find purchases with receipts.",
  ];
  const libraryTurns: CareTurn[] = [];
  for (const question of libraryQuestions) {
    const turn = await sendCare(page, dialog, question);
    libraryTurns.push(turn);
    expect(turn.answer.outcome).toBe("answered");
    expect(turn.answer.mode).toBe("deterministic");
    expect(turn.answer.questionScope).toBe("library");
    expect(turn.answer.context).toBeNull();
    expect(turn.answer.recordsResult?.coverage.complete).toBe(true);
    expect(turn.answer.recordsResult?.records.length).toBeGreaterThan(1);
    if (turn.answer.recordsResult?.query.operation === "total")
      expect(turn.answer.recordsResult.totals[0].amountMinor).toBe(30700);
    expect(turn.answer.text).not.toMatch(/\$\s*129|129\.00/);
    expect(turn.answer.purchaseChoices).toBeUndefined();
    await expect(dialog.locator(".careos-context strong")).toHaveText(
      "Everyday headphones · F-01",
    );
    await expect(
      dialog.locator(`[data-request-id="${turn.requestId}"]`),
    ).toHaveAttribute("data-answer-mode", "deterministic");
    await expect(
      dialog.locator(
        `[data-request-id="${turn.requestId}"] [data-answer-scope]`,
      ),
    ).toHaveClass(/\bsr-only\b/);
    await expect(
      dialog.getByRole("region", { name: "Choose a purchase", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(headphone);
  }
  const productTurn = await sendCare(page, dialog, "Find receipt");
  expect(productTurn.answer.context?.twinId).toBe(headphoneId);
  await expect(
    dialog.locator("[data-latest-answer]").getByRole("link", {
      name: "View full receipt or document",
      exact: true,
    }),
  ).toHaveAttribute("href", receipt);
  // Earlier library answers keep their scope after another product answer.
  for (const turn of libraryTurns) {
    await selectHistory(dialog, turn.message, turn.requestId);
    await expect(dialog.locator("[data-answer-scope]")).toHaveClass(
      /\bsr-only\b/,
    );
    await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
      "data-answer-mode",
      turn.answer.mode,
    );
  }
});

test("owned result history and draft survive navigation, Insights, return and close/reopen without extra work", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/purchases");
  let opened = await openNorth(page);
  await chooseHeadphones(page, opened.dialog);
  const care = await sendCare(page, opened.dialog, "Find receipt");
  await opened.composer.fill("Keep this cross-page draft");
  for (const [label, path] of [
    ["Purchases", "/purchases"],
    ["All documents", "/documents"],
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
      opened.dialog.getByRole("link", {
        name: "View full receipt or document",
        exact: true,
      }),
    ).toHaveAttribute("href", receipt);
  }
  // Explicit presentation command keeps this a mixed care/native-transport
  // continuity regression; monetary category queries have separate real-SDK tests.
  await opened.composer.fill("Reset this dashboard");
  await opened.dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(opened.dialog.locator("[data-pending-question]")).toHaveCount(
    0,
    { timeout: 20_000 },
  );
  await expect(opened.dialog.locator("[data-latest-answer]")).toContainText(
    "I checked the view and its purchases after making the change",
  );
  await expect(opened.dialog.locator("[data-user-message]")).toHaveText(
    "Reset this dashboard",
  );
  const planId = await opened.dialog
    .locator("article[data-request-id]")
    .getAttribute("data-request-id");
  await selectHistory(opened.dialog, care.message, care.requestId);
  await expect(
    opened.dialog.locator("article[data-request-id]"),
  ).toHaveAttribute("data-request-id", care.requestId);
  await expect(opened.dialog.locator("[data-answer-scope]")).toContainText(
    "Everyday headphones · F-01",
  );
  await selectHistory(opened.dialog, "Reset this dashboard", planId!);
  await expect(
    opened.dialog.locator("article[data-request-id]"),
  ).toHaveAttribute("data-request-id", planId!);
  expect(planId).not.toBe(care.requestId);
  await opened.composer.fill("Retain this after the Insights answer");
  const mutations = log.mutations();
  const bootstraps = log.bootstraps();
  const modelWork = log.modelWork();
  const url = page.url();
  await opened.dialog
    .getByRole("button", { name: "Close North Star", exact: true })
    .click();
  opened = await openNorth(page);
  expect(page.url()).toBe(url);
  expect(log.mutations()).toEqual(mutations);
  expect(log.bootstraps()).toEqual(bootstraps);
  expect(log.modelWork()).toEqual(modelWork);
  await navigate(page, "Purchases", "/purchases");
  opened = await openNorth(page);
  await expect(opened.composer).toHaveValue(
    "Retain this after the Insights answer",
  );
  await expect(opened.dialog.locator("[data-user-message]")).toHaveText(
    "Reset this dashboard",
  );
  await expect(
    opened.dialog.locator("article[data-request-id]"),
  ).toHaveAttribute("data-request-id", planId!);
  await selectHistory(opened.dialog, care.message, care.requestId);
  await expect(
    opened.dialog.locator("article[data-request-id]"),
  ).toHaveAttribute("data-request-id", care.requestId);
  await expect(opened.dialog.locator("[data-answer-scope]")).toContainText(
    "Everyday headphones · F-01",
  );
  await expect(opened.dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  expect(log.mutations()).toEqual(mutations);
  expect(log.bootstraps()).toHaveLength(1);
});

test("Insights routes supported library queries and exact-product receipt/amount questions without losing context", async ({
  page,
}) => {
  const log = requestLog(page);
  await page.goto("/insights");
  await expect(page.getByTestId("insight-documents-care")).toBeVisible({
    timeout: 20_000,
  });
  const { dialog } = await openNorth(page);
  await chooseHeadphones(page, dialog);
  const libraryTurn = await sendCare(
    page,
    dialog,
    "Find purchases with receipts.",
  );
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    "Find purchases with receipts.",
  );
  expect(libraryTurn.answer.questionScope).toBe("library");
  expect(libraryTurn.answer.context).toBeNull();
  const library = dialog.locator(
    `[data-request-id="${libraryTurn.requestId}"]`,
  );
  await expect(library.locator("[data-records-result]")).toBeVisible();
  await expect(
    library
      .getByRole("list", { name: "Matching saved purchases" })
      .getByRole("listitem"),
  ).toHaveCount(2);
  await expect(library).toHaveAttribute("data-answer-mode", "deterministic");
  await expect(library.locator("[data-answer-scope]")).toHaveClass(
    /\bsr-only\b/,
  );
  const libraryId = await library.getAttribute("data-request-id");
  await expect(dialog.locator(".careos-context strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  const productReceipt = await sendCare(page, dialog, "Find receipt");
  expect(productReceipt.answer.context?.twinId).toBe(headphoneId);
  await expect(
    dialog.locator("[data-latest-answer]").getByRole("link", {
      name: "View full receipt or document",
      exact: true,
    }),
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
  await selectHistory(
    dialog,
    "Find purchases with receipts.",
    libraryTurn.requestId,
  );
  await expect(
    dialog.locator(`[data-request-id="${libraryId}"] [data-answer-scope]`),
  ).toHaveClass(/\bsr-only\b/);
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
  // Wait for the root's initial presentation commit before installing the saved
  // tab fixture. Otherwise its queued bootstrap can overwrite the injected order.
  await expect
    .poll(() =>
      page.evaluate(
        () => !!sessionStorage.getItem("palcare-careos-interaction-v1"),
      ),
    )
    .toBe(true);
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
    await expect(dialog.locator("[data-user-message]")).toHaveText(
      last.message,
    );
    await dialog.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      dialog
        .getByRole("region", { name: "Previous North results", exact: true })
        .locator("ol button"),
    ).toHaveText([first.message, plannedQuestion, last.message]);
    await dialog
      .getByRole("region", { name: "Previous North results", exact: true })
      .getByRole("button", { name: plannedQuestion, exact: true })
      .click();
    const recovered = dialog.locator(
      `[data-request-id="${planned.requestId}"]`,
    );
    await expect(recovered).toContainText(
      "This saved answer describes an earlier Insights view. Open Insights to check the current view; no changes were reapplied after reload.",
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
    await expect(dialog.locator("article[data-request-id]")).toHaveCount(1);
    await selectHistory(dialog, first.message, first.requestId);
    await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
      "data-request-id",
      first.requestId,
    );
    await selectHistory(dialog, last.message, last.requestId);
    await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
      "data-request-id",
      last.requestId,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              sessionStorage.getItem("palcare-north-workspace-v1") ?? "null",
            )?.id,
        ),
      )
      .toBe(last.requestId);
    expect(
      log.requests.filter(
        (entry) => entry === "GET /api/intelligence/customer/plan",
      ).length,
    ).toBeGreaterThan(beforeReads);
    expect(log.mutations()).toEqual([]);
    await dialog
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              sessionStorage.getItem("palcare-north-workspace-v1") ?? "null",
            )?.open,
        ),
      )
      .toBe(false);
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
  await openNorth(
    page,
    "Some saved Insights history is unavailable. Available entries were restored",
  );
  const denied = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(denied.getByRole("alert")).toContainText(
    "Some saved Insights history is unavailable. Available entries were restored",
  );
  await expect(denied.locator("[data-user-message]")).toHaveText(last.message);
  await expect(
    denied.locator(`[data-request-id="${deniedRequestId}"]`),
  ).toHaveCount(0);
  await selectHistory(denied, plannedQuestion, planned.requestId);
  await expect(
    denied.locator(`[data-request-id="${planned.requestId}"]`),
  ).toContainText(
    "This saved answer describes an earlier Insights view. Open Insights to check the current view; no changes were reapplied after reload.",
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
  // Seed before hydration can load/persist presentation defaults. The marker
  // prevents reload from replacing the original uncertain envelope or its age.
  await page.addInitScript(
    ({ careId, planId, requestId, context }) => {
      const marker = `palcare-e2e-uncertain-insights-${requestId}`;
      if (window !== window.top || sessionStorage.getItem(marker)) return;
      const createdAt = Date.now();
      sessionStorage.setItem("palcare-careos-conversation", careId);
      sessionStorage.setItem(
        "palcare-insights-pending-v1",
        JSON.stringify({
          requestId,
          conversationId: planId,
          message: "Show my documents",
          createdAt,
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
          savedAt: createdAt,
        }),
      );
      sessionStorage.setItem(marker, "true");
    },
    { careId, planId, requestId, context: headphoneContext },
  );
  await page.goto("/purchases");
  await expect(
    page.getByRole("searchbox", {
      name: "Search products and documents",
      exact: true,
    }),
  ).toHaveValue("Find receipt");
  const originalPending = await page.evaluate(() =>
    sessionStorage.getItem("palcare-insights-pending-v1"),
  );
  expect(originalPending).not.toBeNull();
  expect(JSON.parse(originalPending!)).toMatchObject({
    requestId,
    conversationId: planId,
    message: planned.message,
  });
  await page.reload();
  const { dialog, composer } = await openNorth(page);
  const expectRetainedDraftAndContext = async () => {
    await expect(composer).toHaveValue("Find receipt");
    await expect(dialog.locator(".careos-context strong")).toHaveText(
      "Everyday headphones · F-01",
    );
    await expect(
      dialog.getByRole("region", {
        name: "Persistent purchase context",
        exact: true,
      }),
    ).toContainText("Oct 18, 2026 · Example purchase");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(sessionStorage.getItem("palcare-careos-interaction-v1")!)
            .context,
      ),
    ).toEqual(headphoneContext);
  };
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    requestId,
  );
  await expect(
    dialog.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeDisabled();
  await expectRetainedDraftAndContext();
  await composer.press("Enter");
  await expectRetainedDraftAndContext();
  await dialog
    .locator("form")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expectRetainedDraftAndContext();
  expect(inputs).toEqual([]);
  expect(log.mutations()).toEqual([]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("palcare-insights-pending-v1"),
    ),
  ).toBe(originalPending);
  const recovery = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/intelligence/customer/plan" &&
      url.searchParams.get("conversationId") === planId
    );
  });
  await dialog
    .getByRole("button", { name: "Check for saved answer", exact: true })
    .click();
  expect((await recovery).ok()).toBe(true);
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
  await expectRetainedDraftAndContext();
  expect(inputs).toEqual([]);
  expect(log.mutations()).toEqual([]);
  const result = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/careos/conversations/${careId}/turns`,
  );
  // Submit the restored draft itself: refilling would hide a recovery regression.
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const response = await result;
  expect(response.ok()).toBe(true);
  const answered = (await response.json()) as CareTurn;
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(
    dialog.locator(
      `[data-request-id="${answered.requestId}"] [data-user-message]`,
    ),
  ).toHaveText("Find receipt");
  expect(answered.requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(answered.requestId).not.toBe(requestId);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toMatchObject({
    requestId: answered.requestId,
    twinId: headphoneId,
    message: "Find receipt",
  });
  expect(log.mutations()).toEqual([
    `POST /api/careos/conversations/${careId}/turns`,
  ]);
  expect(
    log.requests.filter((entry) => entry.startsWith("POST /api/intelligence/")),
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("palcare-insights-pending-v1")!),
    ),
  ).toMatchObject(JSON.parse(originalPending!));
  await selectHistory(dialog, planned.message, planned.requestId);
  await expect(
    dialog.getByRole("link", {
      name: "Return to Insights to apply saved view",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/purchases$/);
  expect(log.mutations()).toEqual([
    `POST /api/careos/conversations/${careId}/turns`,
  ]);
});
