import { test, expect, type Page } from "@playwright/test";
import type {
  CareContext,
  CareTurn,
  Conversation,
  TurnInput,
} from "../../src/lib/careos/contracts";

// Intercepted transport proves presentation/lifecycle only: no model, payment,
// actual database conversation or real-device acceptance is claimed here.
const headphones: CareContext = {
  twinId: "00000000-0000-4000-8000-000000000201",
  name: "Everyday headphones",
  model: "F-01",
  origin: "sample",
  purchasedOn: "2026-10-18",
};
const kettle: CareContext = {
  twinId: "00000000-0000-4000-8000-000000000202",
  name: "Pour-over kettle",
  model: "H-02",
  origin: "sample",
  purchasedOn: "2026-10-12",
};
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "North Star", exact: true });
const composer = (page: Page) =>
  panel(page).getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
const search = (page: Page) =>
  page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
const launcher = (page: Page) =>
  page.getByRole("button", { name: "Explore with North Star", exact: true });
const panelControl = (page: Page, name: string) =>
  panel(page)
    .locator("header")
    .getByRole("button", { name, exact: true })
    .or(
      panel(page)
        .getByRole("region", { name: "North start", exact: true })
        .getByRole("button", { name, exact: true }),
    );

test("separate chats use distinct actual saved-record conversations without deleting the first", async ({
  page,
}) => {
  await page.goto("/purchases");
  await launcher(page).click();
  const created = () =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/api/careos/records/conversations",
    );
  const firstCreated = created();
  const first = await send(page, "Show all my purchases and totals");
  const firstConversation = (await (await firstCreated).json()) as Conversation;
  await panelControl(page, "New chat").click();
  const secondCreated = created();
  const second = await send(page, "Show my Audio purchases");
  const secondConversation = (await (
    await secondCreated
  ).json()) as Conversation;
  expect(secondConversation.id).not.toBe(firstConversation.id);
  const saved = await page.request.get(
    `/api/careos/records/conversations/${firstConversation.id}`,
  );

  expect(saved.ok()).toBe(true);
  const original = (await saved.json()) as Conversation;
  expect(original.turns.map((turn) => turn.requestId)).toEqual([
    first.requestId,
  ]);
  const next = await page.request.get(
    `/api/careos/records/conversations/${secondConversation.id}`,
  );
  expect(next.ok()).toBe(true);
  expect(
    ((await next.json()) as Conversation).turns.map((turn) => turn.requestId),
  ).toEqual([second.requestId]);
  await panelControl(page, "Previous chats").click();
  await panel(page)
    .getByRole("button", { name: first.message, exact: false })
    .click();
  await expect(
    panel(page).locator(`[data-request-id="${first.requestId}"]`),
  ).toBeVisible();
  await expect(
    panel(page).locator(`[data-request-id="${second.requestId}"]`),
  ).toHaveCount(0);
});

test("a known-unsent question stays with its original chat and is never replayed by switching", async ({
  page,
}) => {
  const state = await interceptConversations(page);
  const message = "Help me care for these headphones";
  let creates = 0;
  await page.route("**/api/careos/conversations", async (route) => {
    creates++;
    await route.fulfill({ status: 503, json: { error: "careos_unavailable" } });
  });
  await page.goto(`/vault/${headphones.twinId}`);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  await composer(page).fill(message);
  await panel(page)
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect(panel(page).locator("[data-unsent-question]")).toContainText(
    message,
  );
  expect(creates).toBe(1);
  await panelControl(page, "New chat").click();
  await expect(panel(page).locator("[data-unsent-question]")).toHaveCount(0);
  await expect(composer(page)).toHaveValue("");
  await panelControl(page, "Previous chats").click();
  await panel(page)
    .getByRole("region", { name: "Previous chats", exact: true })
    .getByRole("button", { name: message, exact: false })
    .click();
  await expect(panel(page).locator("[data-unsent-question]")).toContainText(
    message,
  );
  await panel(page)
    .getByRole("button", { name: "Edit unsent question", exact: true })
    .click();
  await expect(composer(page)).toHaveValue(message);
  expect(creates).toBe(1);
  expect(state.writes).toEqual([]);
});

async function interceptConversations(
  page: Page,
  prepareTurn?: (turn: CareTurn) => void,
) {
  const conversations = new Map<string, Conversation>();
  const writes: { path: string; input: unknown }[] = [];
  const reads: string[] = [];
  const prohibited: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const match = url.pathname.match(
      /^\/api\/careos\/(?:records\/)?conversations(?:\/([a-f0-9-]{36})(?:\/(turns|interpret))?)?$/,
    );
    if (match && request.method() === "GET" && match[1]) {
      reads.push(url.pathname);
      const value = conversations.get(match[1]);
      await route.fulfill(
        value
          ? { json: value }
          : { status: 404, json: { error: "careos_conversation_missing" } },
      );
      return;
    }
    if (match && request.method() === "POST") {
      const input = request.postDataJSON();
      writes.push({ path: url.pathname, input });
      if (!match[1]) {
        const id = `00000000-0000-4000-8000-${String(9900 + conversations.size).padStart(12, "0")}`;
        const value: Conversation = {
          id,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          turns: [],
        };
        conversations.set(id, value);
        await route.fulfill({ json: value });
        return;
      }
      const saved = conversations.get(match[1]);
      expect(
        saved,
        "A turn must use its own created conversation",
      ).toBeDefined();
      const turnInput = input as TurnInput;
      const context = turnInput.twinId === kettle.twinId ? kettle : headphones;
      const document = context === kettle ? "302" : "301";
      const turn: CareTurn = {
        requestId: turnInput.requestId,
        message: turnInput.message,
        answer: {
          outcome: "answered",
          mode: "fixture",
          context,
          revision: turnInput.revision,
          text: `Injected saved-record answer for ${context.name}. No manufacturer manual is established.`,
          steps: [],
          sources: [
            {
              id: `sample-receipt-${document}`,
              title: `${context.name} saved receipt`,
              label: "Example purchase · not a manufacturer manual",
              href: `/documents/00000000-0000-4000-8000-000000000${document}`,
              excerpt: "Example receipt. No payment was processed.",
            },
          ],
          actions: [],
        },
      };
      prepareTurn?.(turn);
      saved!.turns.push(turn);
      await route.fulfill({ json: turn });
      return;
    }
    const externalProvider =
      /(^|\.)(paypal\.com|openai\.com|chatgpt\.com|channel3\.ai)$/.test(
        url.hostname,
      );
    if (
      externalProvider ||
      (url.pathname.startsWith("/api/") &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method()))
    ) {
      prohibited.push(`${request.method()} ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  return { conversations, writes, reads, prohibited };
}

async function send(page: Page, message: string) {
  await composer(page).fill(message);
  const response = page.waitForResponse(
    (value) =>
      value.request().method() === "POST" &&
      /\/conversations\/[^/]+\/(turns|interpret)$/.test(
        new URL(value.url()).pathname,
      ),
  );
  await panel(page)
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const turn = (await saved.json()) as CareTurn;
  await expect(
    panel(page).locator(`[data-request-id="${turn.requestId}"]`),
  ).toBeVisible();
  await expect(panel(page).locator("[data-pending-question]")).toHaveCount(0);
  return turn;
}

test("injected dated headphones choices navigate through saved fixture GETs without another conversation POST", async ({
  page,
}) => {
  // The fixture has only one headphones Twin. The second choice deliberately
  // aliases the real kettle ID as a dated headphones sibling in the intercepted
  // answer only. Real context GETs and real routes must resolve the actual kettle;
  // this is UI transport regression coverage, not genuine duplicate-purchase or
  // live model/Sandbox acceptance.
  const sibling: CareContext = {
    ...headphones,
    twinId: kettle.twinId,
    purchasedOn: kettle.purchasedOn,
  };
  const state = await interceptConversations(page, (turn) => {
    turn.answer = {
      ...turn.answer,
      outcome: "selection",
      context: null,
      text: "Which dated example headphones purchase do you mean?",
      sources: [],
      purchaseChoices: [headphones, sibling].map((context) => ({
        context,
        purchasedOn: context.purchasedOn!,
        provenance: "Sample",
      })),
    };
  });
  const contextRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/careos/context") {
      expect(request.method()).toBe("GET");
      contextRequests.push(`${url.pathname}${url.search}`);
    }
  });
  await page.goto("/purchases");
  await launcher(page).click();
  const first = await send(page, "Take me to my headphones");
  expect(state.writes).toHaveLength(2);
  expect(state.conversations.size).toBe(1);
  const original = structuredClone([...state.conversations.values()]);
  const settledWrites = structuredClone(state.writes);
  const choices = panel(page).getByRole("region", {
    name: "Choose a purchase",
    exact: true,
  });
  const datedChoices = choices.getByRole("button", {
    name: /Everyday headphones/,
  });
  await expect(datedChoices).toHaveCount(2);
  await expect(datedChoices.nth(0).locator("time")).toHaveAttribute(
    "datetime",
    headphones.purchasedOn!,
  );
  await expect(datedChoices.nth(1).locator("time")).toHaveAttribute(
    "datetime",
    kettle.purchasedOn!,
  );
  const contextResponse = (twinId: string) =>
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/careos/context" &&
        new URL(response.url()).search === `?twinId=${twinId}`,
    );
  const selectedRead = contextResponse(headphones.twinId!);
  await datedChoices.nth(0).click();
  const selected = await selectedRead;
  expect(selected.ok()).toBe(true);
  const resolved = await selected.json();
  expect(resolved.context.twinId).toBe(headphones.twinId);
  expect(resolved.actions).toContainEqual({
    destination: "receipt",
    label: "View receipt",
    href: "/documents/00000000-0000-4000-8000-000000000301",
  });
  await expect(page).toHaveURL(`/vault/${headphones.twinId}`);

  async function restoreAndCheck(context: CareContext) {
    await page
      .getByRole("button", { name: "Restore North Star", exact: true })
      .click();
    await expect(
      panel(page).locator(`[data-request-id="${first.requestId}"]`),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("region", {
        name: "Persistent purchase context",
        exact: true,
      }),
    ).toContainText(context.name);
    expect(state.writes).toEqual(settledWrites);
    expect([...state.conversations.values()]).toEqual(original);
  }
  let currentTwinId = headphones.twinId;
  async function navigate(
    message: string,
    target: string,
    context?: CareContext,
  ) {
    const beforeReads = contextRequests.length;
    const read = context ? contextResponse(context.twinId!) : undefined;
    await composer(page).fill(message);
    await panel(page)
      .getByRole("button", { name: "Send to North Star", exact: true })
      .click();
    if (read) {
      const response = await read;
      expect(response.ok()).toBe(true);
      expect((await response.json()).context.twinId).toBe(context!.twinId);
    }
    await expect(page).toHaveURL(target);
    if (!context || context.twinId === currentTwinId) {
      expect(contextRequests.length - beforeReads).toBe(context ? 1 : 0);
    }
    if (context) currentTwinId = context.twinId;
    expect(state.writes).toEqual(settledWrites);
  }

  await restoreAndCheck(headphones);
  const actions = panel(page).getByRole("region", {
    name: "Selected purchase actions",
    exact: true,
  });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button")).toHaveCount(
    resolved.actions.length,
  );
  for (const action of resolved.actions) {
    await expect(
      actions.getByRole("button", { name: action.label, exact: true }),
    ).toBeVisible();
  }
  const buttonRead = contextResponse(headphones.twinId!);
  await actions
    .getByRole("button", { name: "View receipt", exact: true })
    .click();
  expect((await buttonRead).ok()).toBe(true);
  await expect(page).toHaveURL(
    "/documents/00000000-0000-4000-8000-000000000301",
  );
  await restoreAndCheck(headphones);
  await navigate("go back", `/vault/${headphones.twinId}`);
  await restoreAndCheck(headphones);
  await navigate(
    "show me its receipt",
    "/documents/00000000-0000-4000-8000-000000000301",
    headphones,
  );
  await restoreAndCheck(headphones);
  await navigate(
    "Now take me there",
    `/vault/${headphones.twinId}`,
    headphones,
  );
  await restoreAndCheck(headphones);
  await navigate("go back", "/documents/00000000-0000-4000-8000-000000000301");
  await restoreAndCheck(headphones);
  await navigate("open it", `/vault/${headphones.twinId}`, headphones);
  await restoreAndCheck(headphones);
  await navigate("the other one", `/vault/${kettle.twinId}`, kettle);
  await restoreAndCheck(kettle);
  await navigate(
    "show me its receipt",
    "/documents/00000000-0000-4000-8000-000000000302",
    kettle,
  );
  await restoreAndCheck(kettle);
  expect(new Set(contextRequests)).toEqual(
    new Set([
      `/api/careos/context?twinId=${headphones.twinId}`,
      `/api/careos/context?twinId=${kettle.twinId}`,
    ]),
  );
  expect(state.writes).toHaveLength(2);
  expect(state.prohibited).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`North opens as a nonmodal floating ${viewport.width > 1023 ? "420px panel" : "mobile sheet"} without replacing or moving the collection`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const state = await interceptConversations(page);
    await page.goto("/purchases");
    const cards = page.locator("[data-purchase-card]");
    await expect(cards).toHaveCount(4);
    // Retain actual node identities, not merely matching replacement markup.
    await cards.first().evaluate((node) => {
      node.setAttribute("data-north-mount-probe", "retained");
    });
    await page.locator('select[name="category"]').evaluate((node) => {
      node.setAttribute("data-north-filter-probe", "retained");
    });
    await launcher(page).scrollIntoViewIfNeeded();
    const before = await cards.first().boundingBox();
    const scrollBefore = await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
    }));
    await launcher(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveCount(1);
    await expect(panel(page)).toHaveAttribute("aria-modal", "false");
    const geometry = await panel(page).evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        inMain: !!node.closest("main"),
        position: getComputedStyle(node).position,
        width: box.width,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
    });
    expect(geometry.inMain).toBe(false);
    expect(geometry.position).toBe("fixed");
    expect(geometry.width).toBe(viewport.width > 1023 ? 420 : viewport.width);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
    await expect(cards.first()).toHaveAttribute(
      "data-north-mount-probe",
      "retained",
    );
    await expect(page.locator('select[name="category"]')).toHaveAttribute(
      "data-north-filter-probe",
      "retained",
    );
    await expect(search(page)).toHaveCount(0);
    expect(await cards.first().boundingBox()).toEqual(before);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(
      scrollBefore,
    );
    await expect(page.locator("html")).not.toHaveClass(/careos-reading-space/);
    await expect(page.locator(".careos-overlay")).toHaveCount(0);
    await expect(panelControl(page, "New chat")).toBeVisible();
    await expect(panelControl(page, "Previous chats")).toBeVisible();
    const suggestions = panel(page)
      .getByRole("list", { name: "Question suggestions", exact: true })
      .getByRole("button");
    await expect(suggestions).toHaveCount(4);
    const messages = await suggestions.allTextContents();
    for (const suggestion of messages) {
      await panel(page)
        .getByRole("button", { name: suggestion, exact: true })
        .click();
      await expect(composer(page)).toHaveValue(suggestion);
      await expect(panel(page).locator("[data-user-message]")).toHaveCount(0);
      expect(state.writes).toEqual([]);
      await panelControl(page, "North Star start").click();
    }
    await composer(page).fill("Keep this unsent floating draft");
    await panel(page)
      .getByRole("button", { name: "Minimize North Star", exact: true })
      .click();
    await expect(panel(page)).not.toBeVisible();
    expect(await cards.first().boundingBox()).toEqual(before);
    await page
      .getByRole("button", { name: "Restore North Star", exact: true })
      .click();
    await expect(composer(page)).toHaveValue("Keep this unsent floating draft");
    await panel(page)
      .getByRole("button", { name: "Close North Star", exact: true })
      .click();
    await expect(panel(page)).not.toBeVisible();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(
      scrollBefore,
    );
    expect(state.writes).toEqual([]);
    expect(state.conversations.size).toBe(0);
    expect(state.prohibited).toEqual([]);
  });
}

test("New chat lazily creates a separate conversation and Previous chats restores original context, sources and draft by owned reads only", async ({
  page,
}) => {
  const state = await interceptConversations(page);
  await page.goto(`/vault/${headphones.twinId}`);
  await page
    .getByRole("button", {
      name: "Ask North Star about this purchase",
      exact: true,
    })
    .click();
  await expect(
    panel(page).getByRole("region", {
      name: "Persistent purchase context",
      exact: true,
    }),
  ).toContainText("Everyday headphones");
  expect(state.writes).toEqual([]);
  const first = await send(page, "Help me care for these headphones");
  const firstConversation = [...state.conversations.values()].find((value) =>
    value.turns.some((turn) => turn.requestId === first.requestId),
  )!;
  const originalFirst = structuredClone(firstConversation);
  await composer(page).fill("Keep the headphones follow-up draft");
  const beforeNew = [...state.writes];
  // Returning to the welcome screen is presentation-only, even after a turn.
  await panelControl(page, "North Star start").click();
  await expect(
    panel(page).getByRole("region", { name: "North start", exact: true }),
  ).toBeVisible();
  await expect(composer(page)).toHaveValue(
    "Keep the headphones follow-up draft",
  );
  expect(state.writes).toEqual(beforeNew);
  await panelControl(page, "New chat").click();
  await expect(composer(page)).toHaveValue("");
  await expect(
    panel(page).locator(`[data-request-id="${first.requestId}"]`),
  ).toHaveCount(0);
  expect(state.writes).toEqual(beforeNew);
  expect(state.conversations.size).toBe(1);
  await panel(page)
    .getByRole("button", { name: "Choose purchase", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a purchase", exact: true })
    .getByRole("button", { name: /Pour-over kettle/ })
    .click();
  const second = await send(page, "Help me care for this kettle");
  const secondConversation = [...state.conversations.values()].find((value) =>
    value.turns.some((turn) => turn.requestId === second.requestId),
  )!;
  expect(secondConversation.id).not.toBe(firstConversation.id);
  expect(second.requestId).not.toBe(first.requestId);
  expect(secondConversation.turns.map((turn) => turn.requestId)).toEqual([
    second.requestId,
  ]);
  expect(firstConversation).toEqual(originalFirst);
  const turnWrites = state.writes.filter((value) =>
    /\/(turns|interpret)$/.test(value.path),
  );
  expect(turnWrites).toHaveLength(2);
  expect(
    turnWrites.map((value) =>
      value.path.replace(/\/[a-f0-9-]{36}\/(turns|interpret)$/, ""),
    ),
    "Both chats must isolate conversations within the same transport channel",
  ).toEqual(["/api/careos/conversations", "/api/careos/conversations"]);
  expect(turnWrites.map((value) => (value.input as TurnInput).twinId)).toEqual([
    headphones.twinId,
    kettle.twinId,
  ]);
  expect((turnWrites[1].input as TurnInput).followupRequestId).toBeUndefined();
  expect(state.conversations.size).toBe(2);
  expect(state.writes).toHaveLength(4);
  await composer(page).fill("Keep the kettle follow-up draft");
  const settledWrites = [...state.writes];
  const navigation = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  for (const destination of ["Purchases & Docs", "Insights", "Care"]) {
    await navigation
      .getByRole("link", { name: destination, exact: true })
      .click();
    await expect(panel(page)).toBeVisible();
    await expect(
      panel(page).locator(`[data-request-id="${second.requestId}"]`),
    ).toBeVisible();
    await expect(composer(page)).toHaveValue("Keep the kettle follow-up draft");
    await expect(
      panel(page).getByRole("region", {
        name: "Persistent purchase context",
        exact: true,
      }),
    ).toContainText("Pour-over kettle");
    expect(state.writes).toEqual(settledWrites);
  }
  await panelControl(page, "Previous chats").click();
  await panel(page)
    .getByRole("button", { name: first.message, exact: false })
    .click();
  await expect(
    panel(page).locator(`[data-request-id="${first.requestId}"]`),
  ).toBeVisible();
  await expect(
    panel(page).locator(`[data-request-id="${second.requestId}"]`),
  ).toHaveCount(0);
  await expect(composer(page)).toHaveValue(
    "Keep the headphones follow-up draft",
  );
  await expect(
    panel(page).getByRole("region", {
      name: "Persistent purchase context",
      exact: true,
    }),
  ).toContainText("Everyday headphones");
  const sources = panel(page)
    .locator("details")
    .filter({
      has: page.locator("summary").filter({ hasText: /^Sources \(1\)$/ }),
    });
  await sources.locator("summary").click();
  const receipt = sources.getByRole("link", {
    name: "Everyday headphones saved receipt",
    exact: true,
  });
  await expect(receipt).toHaveAttribute(
    "href",
    "/documents/00000000-0000-4000-8000-000000000301",
  );
  await expect(sources).toContainText(
    "Example purchase · not a manufacturer manual",
  );
  await receipt.click();
  await expect(page).toHaveURL(
    /\/documents\/00000000-0000-4000-8000-000000000301$/,
  );
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).locator(`[data-request-id="${first.requestId}"]`),
  ).toBeVisible();
  await page.reload();
  await expect(
    panel(page).locator(`[data-request-id="${first.requestId}"]`),
  ).toBeVisible();
  await expect(composer(page)).toHaveValue(
    "Keep the headphones follow-up draft",
  );
  expect(
    state.reads.some((path) => path.endsWith(`/${firstConversation.id}`)),
  ).toBe(true);
  expect(state.writes).toEqual(settledWrites);
  await panelControl(page, "Previous chats").click();
  await panel(page)
    .getByRole("button", { name: second.message, exact: false })
    .click();
  await expect(
    panel(page).locator(`[data-request-id="${second.requestId}"]`),
  ).toBeVisible();
  await expect(composer(page)).toHaveValue("Keep the kettle follow-up draft");
  await expect(
    panel(page).getByRole("region", {
      name: "Persistent purchase context",
      exact: true,
    }),
  ).toContainText("Pour-over kettle");
  expect(
    state.reads.some((path) => path.endsWith(`/${secondConversation.id}`)),
  ).toBe(true);
  expect(state.writes).toEqual(settledWrites);
  expect(firstConversation).toEqual(originalFirst);
  expect(state.prohibited).toEqual([]);
});
