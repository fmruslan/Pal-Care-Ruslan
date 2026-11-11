import { test, expect, type Page } from "@playwright/test";
import type {
  CareTurn,
  Conversation,
  TurnInput,
} from "../../src/lib/careos/contracts";

const forma = "/vault/00000000-0000-4000-8000-000000000201";
const id = "00000000-0000-4000-8000-000000000099";
const context = {
  twinId: forma.split("/").at(-1)!,
  name: "Everyday headphones",
  model: "F-01",
  origin: "sample",
};
function turn(input: TurnInput, long = false): CareTurn {
  return {
    requestId: input.requestId,
    message: input.message,
    answer: {
      outcome: "answered",
      mode: "deterministic",
      context,
      revision: input.revision,
      text: "Answer begins here. This is injected UI evidence, not a model response.",
      steps: long
        ? Array.from(
            { length: 36 },
            (_, i) =>
              `Reading line ${i + 1}: saved information stays attached to this purchase. Read it at your own pace.`,
          )
        : [],
      sources: [],
      actions: [],
    },
  };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function transport(
  page: Page,
  options: { history?: boolean; restoreGate?: ReturnType<typeof gate> } = {},
) {
  const saved: Conversation = {
    id,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    turns: [],
  };
  if (options.history)
    saved.turns = Array.from({ length: 4 }, (_, i) =>
      turn(
        {
          requestId: `00000000-0000-4000-8000-00000000000${i + 1}`,
          twinId: context.twinId,
          revision: i,
          message: `Older question ${i + 1}`,
        },
        true,
      ),
    );
  const state = {
    saved,
    inputs: [] as TurnInput[],
    hold: gate(),
    received: gate(),
    failure: false,
    persist: true,
    long: false,
    unavailable: false,
    reads: 0,
  };
  await page.route("**/api/careos/conversations**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/turns")) {
      const input = request.postDataJSON() as TurnInput;
      state.inputs.push(input);
      state.received.release();
      await state.hold.promise;
      const result = turn(input, state.long);
      if (state.unavailable) {
        result.answer.outcome = "unavailable";
        result.answer.text =
          "CareOS could not finish this answer. Your question is saved.";
      }
      if (state.persist) saved.turns.push(result);
      if (state.failure) await route.abort("failed");
      else if (state.unavailable)
        await route.fulfill({
          status: 503,
          json: { error: "careos_unavailable" },
        });
      else await route.fulfill({ json: result });
    } else if (request.method() === "DELETE") {
      saved.turns = [];
      await route.fulfill({ json: { cleared: true } });
    } else {
      if (request.method() === "GET") {
        state.reads++;
        await options.restoreGate?.promise;
      }
      await route.fulfill({
        status: request.method() === "POST" ? 201 : 200,
        json: saved,
      });
    }
  });
  return state;
}
async function open(page: Page) {
  await page.goto(forma);
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    }),
  ).toBeEditable();
  await expect(
    dialog.getByText(
      "Working on your question. You can keep writing your next one.",
      { exact: true },
    ),
  ).toHaveCount(0);
  return {
    dialog,
    composer: dialog.getByLabel("Ask about your purchases", { exact: true }),
    transcript: dialog.getByRole("region", { name: "North Star conversation" }),
  };
}

test("legacy unsent hello never traps Send or suggestions and can be edited without clearing saved history", async ({
  page,
}) => {
  const state = await transport(page, { history: true });
  const originalId = "00000000-0000-4000-8000-000000000077";
  await page.goto(forma);
  await page.evaluate(
    ({ id, context, originalId }) => {
      sessionStorage.setItem("palcare-careos-conversation", id);
      sessionStorage.setItem(
        "palcare-careos-pending-v1",
        JSON.stringify({
          input: {
            requestId: originalId,
            twinId: context.twinId,
            revision: 1,
            message: "hello",
          },
          context,
          conversationId: null,
          createdAt: Date.now(),
        }),
      );
    },
    { id, context, originalId },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog"),
    composer = dialog.getByLabel("Ask about your purchases", { exact: true });
  await expect(dialog.locator("[data-unsent-question]")).toContainText("hello");
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(
    dialog.getByText("Older question 4", { exact: true }),
  ).toBeVisible();
  expect(state.inputs).toHaveLength(0);
  await composer.fill("Keep this newer draft");
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeEnabled();
  await expect(composer).toBeEditable();
  await expect(
    dialog.getByRole("button", { name: "Edit unsent question" }),
  ).toBeDisabled();
  await expect(composer).toHaveValue("Keep this newer draft");
  await composer.fill("");
  await dialog.getByRole("button", { name: "Edit unsent question" }).click();
  await expect(composer).toHaveValue("hello");
  state.hold.release();
  await dialog.getByRole("button", { name: "Send to North Star" }).click();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect.poll(() => state.inputs.length).toBe(1);
  expect(state.inputs[0].requestId).not.toBe(originalId);
  await expect.poll(() => state.saved.turns.length).toBe(5);
});

test("a rejected conversation bootstrap keeps the unsent question editable and permits a later send without Clear", async ({
  page,
}) => {
  const state = await transport(page);
  let reject = true;
  await page.route("**/api/careos/conversations", async (route) => {
    if (reject)
      await route.fulfill({
        status: 403,
        json: { error: "careos_owner_signin_required" },
      });
    else await route.fallback();
  });
  const { dialog, composer } = await open(page);
  await composer.fill("hello");
  await dialog.getByRole("button", { name: "Send to North Star" }).click();
  await expect(dialog.locator("[data-unsent-question]")).toContainText("hello");
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toContainText("verify this browser");
  expect(state.inputs).toHaveLength(0);
  reject = false;
  await composer.fill("Show my receipt");
  state.hold.release();
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Send to North Star" }).click();
  await expect(
    dialog.getByText("Answer begins here.", { exact: false }),
  ).toBeVisible();
  expect(state.inputs).toHaveLength(1);
  await expect(dialog.locator("[data-unsent-question]")).toContainText("hello");
});

test("an expired conversation hint does not strand a question that never reached the turn endpoint", async ({
  page,
}) => {
  const state = await transport(page);
  const expired = "00000000-0000-4000-8000-000000000098";
  await page.route(`**/api/careos/conversations/${expired}`, (route) =>
    route.fulfill({
      status: 404,
      json: { error: "careos_conversation_not_found" },
    }),
  );
  await page.goto(forma);
  await page.evaluate((expired) => {
    sessionStorage.setItem("palcare-careos-conversation", expired);
    sessionStorage.setItem(
      "palcare-careos-pending-v1",
      JSON.stringify({
        input: {
          requestId: crypto.randomUUID(),
          twinId: null,
          revision: 0,
          message: "hello",
        },
        context: null,
        conversationId: null,
        createdAt: Date.now(),
      }),
    );
  }, expired);
  await page.reload();
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-unsent-question]")).toContainText("hello");
  await dialog
    .getByLabel("Ask about your purchases", { exact: true })
    .fill("A new question");
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeEnabled();
  expect(state.inputs).toHaveLength(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("palcare-careos-conversation"),
    ),
  ).toBe(expired);
  state.hold.release();
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  await expect.poll(() => state.inputs.length).toBe(1);
  expect(state.inputs[0].message).toBe("A new question");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("palcare-careos-conversation"),
    ),
  ).toBe(id);
});

test("question renders before a held response; Enter, newline, IME and repeat guards send once", async ({
  page,
}) => {
  const state = await transport(page);
  const { dialog, composer } = await open(page);
  await composer.fill("Find receipt");
  await composer.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  await composer.dispatchEvent("compositionstart");
  await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter" });
  await composer.dispatchEvent("compositionend");
  await composer.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    repeat: true,
  });
  expect(state.inputs).toHaveLength(0);
  await composer.press("Shift+Enter");
  await expect(composer).toHaveValue("Find receipt\n");
  await composer.press("Enter");
  await state.received.promise;
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    "Find receipt",
  );
  await expect(
    dialog.getByText("Looking into your question…", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/Answer begins here/)).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("pending-question.png"),
  });
  await composer.press("Enter");
  await composer.fill("A draft for later");
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeDisabled();
  expect(state.inputs).toHaveLength(1);
  state.hold.release();
  await expect(dialog.getByText(/Answer begins here/)).toBeVisible();
  await expect(dialog.locator("[data-user-message]")).toHaveCount(1);
  await expect(composer).toHaveValue("A draft for later");
  await expect(composer).toBeFocused();
  await composer.scrollIntoViewIfNeeded();
  await expect(composer).toBeInViewport();
  await expect(dialog).toHaveAttribute("aria-modal", "false");
});

test("long atomic answers scroll inside the panel and prior results can be selected without replay or draft loss", async ({
  page,
}) => {
  const state = await transport(page, { history: true });
  state.long = true;
  const { dialog, composer, transcript } = await open(page);
  const pageScroll = await page.evaluate(() => scrollY);
  await composer.fill("A long answer please");
  await composer.press("Enter");
  await state.received.promise;
  await expect(dialog.locator("[data-pending-question]")).toBeInViewport();
  state.hold.release();
  const latest = dialog.locator("[data-latest-answer]");
  await expect(latest).toBeVisible();
  await latest.locator("p").first().scrollIntoViewIfNeeded();
  await expect(latest.locator("p").first()).toBeInViewport();
  const lastLine = latest.locator("ul.list-disc > li").last();
  await lastLine.scrollIntoViewIfNeeded();
  await expect(lastLine).toBeInViewport();
  expect(await transcript.evaluate((node) => node.scrollTop)).toBeGreaterThan(
    0,
  );
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  await expect(composer).toBeInViewport();
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    "A long answer please",
  );
  const firstId = state.inputs[0].requestId;

  state.hold = gate();
  state.received = gate();
  await composer.fill("Another question while I read");
  await composer.press("Enter");
  await state.received.promise;
  state.hold.release();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    "Another question while I read",
  );
  await composer.fill("Keep this draft while reviewing a prior answer");
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await dialog
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: "A long answer please", exact: true })
    .click();
  await expect(
    dialog.locator("article[data-request-id]").last(),
  ).toHaveAttribute("data-request-id", firstId);
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    "A long answer please",
  );
  await expect(composer).toHaveValue(
    "Keep this draft while reviewing a prior answer",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await expect(dialog.locator("[data-user-message]").last()).toHaveText(
    "A long answer please",
  );
  expect(state.inputs).toHaveLength(2);
});

test("an uncertain request survives reload with its identity, and recovery only reads", async ({
  page,
}) => {
  const state = await transport(page);
  state.failure = true;
  state.persist = false;
  const opened = await open(page);
  let dialog = opened.dialog;
  const composer = opened.composer;
  await composer.fill("Keep this original question");
  await composer.press("Enter");
  await state.received.promise;
  const original = state.inputs[0];
  state.hold.release();
  await expect(
    dialog.getByRole("button", { name: "Check for saved answer" }),
  ).toBeEnabled();
  await composer.fill("Keep this draft while the original is uncertain");
  await page.reload();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    original.message,
  );
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    original.requestId,
  );
  await expect(composer).toHaveValue(
    "Keep this draft while the original is uncertain",
  );
  await page.screenshot({
    path: test.info().outputPath("uncertain-recovery.png"),
  });
  const reads = state.reads;
  await dialog.getByRole("button", { name: "Check for saved answer" }).click();
  await expect(dialog.getByRole("alert")).toContainText("No saved answer yet");
  state.saved.turns.push(turn(original));
  await dialog.getByRole("button", { name: "Check for saved answer" }).click();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(dialog.locator("[data-user-message]")).toHaveCount(1);
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    original.message,
  );
  await expect(composer).toHaveValue(
    "Keep this draft while the original is uncertain",
  );
  await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
    "data-request-id",
    original.requestId,
  );
  // GET recovery must not reopen a keyboard or steal focus after a late answer.
  // The composer remains available through a deliberate user action.
  await expect(composer).not.toBeFocused();
  await expect(composer).toBeEditable();
  await composer.focus();
  await expect(composer).toBeFocused();
  expect(state.reads).toBeGreaterThan(reads);
  expect(state.inputs).toEqual([original]);
});

test("a saved unavailable result reconciles an HTTP error without losing the question or draft", async ({
  page,
}) => {
  const state = await transport(page);
  state.unavailable = true;
  const { dialog, composer } = await open(page);
  await composer.fill("Please keep this question");
  await composer.press("Enter");
  await state.received.promise;
  await composer.fill("And keep this draft");
  state.hold.release();
  await expect(
    dialog
      .locator("[data-latest-answer]")
      .getByText(
        "CareOS could not finish this answer. Your question is saved.",
      ),
  ).toBeVisible();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    "Please keep this question",
  );
  await expect(composer).toHaveValue("And keep this draft");
  expect(state.inputs).toHaveLength(1);
});

test("clear and submission are guarded while saved history is restoring", async ({
  page,
}) => {
  const restoring = gate();
  const state = await transport(page, {
    history: true,
    restoreGate: restoring,
  });
  await page.addInitScript((value) => {
    sessionStorage.setItem("palcare-careos-conversation", value);
  }, id);
  await page.goto(forma);
  await page
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("header")
    .getByRole("button", { name: "Previous chats", exact: true })
    .click();
  await dialog.getByText("Conversation settings", { exact: true }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Clear conversation history",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  const composer = dialog.getByLabel("Ask about your purchases", {
    exact: true,
  });
  await composer.fill("Find receipt");
  await expect(
    dialog.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeDisabled();
  expect(state.inputs).toHaveLength(0);
  restoring.release();
  await expect(
    dialog.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeEnabled();
  await dialog
    .locator("header")
    .getByRole("button", { name: "Previous chats", exact: true })
    .click();
  await dialog.getByText("Conversation settings", { exact: true }).click();
  await expect(
    dialog.getByRole("button", {
      name: "Clear conversation history",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Clear conversation history", exact: true })
    .click();
  await expect(dialog.locator("article")).toHaveCount(0);
  expect(state.inputs).toHaveLength(0);
});

test("source disclosure keeps focus and reading position through expansion", async ({
  page,
}) => {
  // Opening North is lazy: supply the existing owned conversation reference
  // instead of implicitly creating a conversation just to obtain its history.
  await page.addInitScript(
    (id) => sessionStorage.setItem("palcare-careos-conversation", id),
    id,
  );
  const state = await transport(page, { history: true });
  state.saved.turns[0].answer.sources = [
    {
      id: "injected-source",
      title: "Saved document",
      href: "/documents",
      label: "Injected disclosure test, not provider evidence.",
      excerpt: "Saved source text. ".repeat(80),
    },
  ];
  const { dialog } = await open(page);
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await dialog
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: "Older question 1", exact: true })
    .click();
  const summary = dialog.locator("summary").filter({ hasText: "Sources (1)" });
  await summary.scrollIntoViewIfNeeded();
  await summary.focus();
  const before = await summary.evaluate(
    (node) => node.getBoundingClientRect().top,
  );
  await summary.press("Enter");
  await expect(summary).toBeFocused();
  expect(
    Math.abs(
      (await summary.evaluate((node) => node.getBoundingClientRect().top)) -
        before,
    ),
  ).toBeLessThan(3);
  await expect(dialog.locator("blockquote")).toContainText(
    "Saved source text.",
  );
  expect(state.inputs).toHaveLength(0);
});

test("denied browser storage keeps the in-memory send and clear path usable", async ({
  page,
}) => {
  const state = await transport(page);
  state.hold.release();
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"] as const)
      Storage.prototype[method] = () => {
        throw new DOMException("Storage denied", "SecurityError");
      };
  });
  const { dialog, composer } = await open(page);
  await composer.fill("A question without storage");
  await composer.press("Enter");
  await expect(dialog.getByText(/Answer begins here/)).toBeVisible();
  await dialog
    .locator("header")
    .getByRole("button", { name: "Previous chats", exact: true })
    .click();
  await dialog.getByText("Conversation settings", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "Clear conversation history", exact: true })
    .click();
  await expect(dialog.locator("article")).toHaveCount(0);
  expect(state.inputs).toHaveLength(1);
});
