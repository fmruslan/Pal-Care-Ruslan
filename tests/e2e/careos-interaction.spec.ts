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
      if (request.method() === "GET") await options.restoreGate?.promise;
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
  await page.locator(".careos-launcher").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Find receipt", exact: true }),
  ).toBeEnabled();
  return {
    dialog,
    composer: dialog.getByLabel("Ask about your purchase"),
    transcript: dialog.getByRole("region", { name: "CareOS conversation" }),
  };
}

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
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    "Find receipt",
  );
  await expect(
    dialog.getByText("Preparing your answer…", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/Answer begins here/)).toHaveCount(0);
  await composer.press("Enter");
  await composer.fill("A draft for later");
  await expect(
    dialog.getByRole("button", { name: "Send to CareOS" }),
  ).toBeDisabled();
  expect(state.inputs).toHaveLength(1);
  state.hold.release();
  await expect(dialog.getByText(/Answer begins here/)).toBeVisible();
  await expect(dialog.locator("[data-user-message]")).toHaveCount(1);
  await expect(composer).toHaveValue("A draft for later");
  await expect(composer).toBeFocused();
  expect(
    await dialog
      .locator(".careos-transcript")
      .evaluate(
        (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
      ),
  ).toBeLessThan(24);
});

test("long atomic answers reveal their beginning, while intentional scroll-up pauses follow", async ({
  page,
}) => {
  const state = await transport(page, { history: true });
  state.long = true;
  const { dialog, composer, transcript } = await open(page);
  await composer.fill("A long answer please");
  await composer.press("Enter");
  await state.received.promise;
  await expect(dialog.locator("[data-pending-question]")).toBeInViewport();
  state.hold.release();
  const latest = dialog.locator("[data-latest-answer]");
  await expect(latest).toBeVisible();
  await expect
    .poll(async () =>
      latest.evaluate(
        (node) =>
          node.getBoundingClientRect().top -
          node.closest(".careos-transcript")!.getBoundingClientRect().top,
      ),
    )
    .toBeGreaterThanOrEqual(14);
  expect(
    await latest.evaluate(
      (node) =>
        node.getBoundingClientRect().top -
        node.closest(".careos-transcript")!.getBoundingClientRect().top,
    ),
  ).toBeLessThan(20);

  state.hold = gate();
  state.received = gate();
  await composer.fill("Another question while I read");
  await composer.press("Enter");
  await state.received.promise;
  await transcript.evaluate((node) => {
    node.scrollTop = 120;
  });
  await expect(
    dialog.getByRole("button", { name: "Jump to latest" }),
  ).toBeVisible();
  const before = await transcript.evaluate((node) => node.scrollTop);
  state.hold.release();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  expect(
    Math.abs((await transcript.evaluate((node) => node.scrollTop)) - before),
  ).toBeLessThan(3);
  const jump = dialog.getByRole("button", { name: "Jump to latest" });
  await jump.focus();
  await jump.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Jump to latest" }),
  ).toHaveCount(0);
  await expect(transcript).toBeFocused();
  expect(
    await latest.evaluate(
      (node) =>
        node.getBoundingClientRect().top -
        node.closest(".careos-transcript")!.getBoundingClientRect().top,
    ),
  ).toBeLessThan(20);
  await transcript.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(() =>
      transcript.evaluate(
        (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
      ),
    )
    .toBeLessThan(2);
  await composer.fill("Typing must not jump back to the answer start");
  await expect
    .poll(() =>
      transcript.evaluate(
        (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
      ),
    )
    .toBeLessThan(2);
  await page.keyboard.press("Escape");
  await page.locator(".careos-launcher").click();
  expect(
    await transcript.evaluate(
      (node) => node.scrollHeight - node.clientHeight - node.scrollTop,
    ),
  ).toBeLessThan(2);
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
  await page.reload();
  await page.locator(".careos-launcher").click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    original.message,
  );
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    original.requestId,
  );
  await dialog.getByRole("button", { name: "Check for saved answer" }).click();
  await expect(dialog.getByRole("alert")).toContainText("No saved answer yet");
  state.saved.turns.push(turn(original));
  await dialog.getByRole("button", { name: "Check for saved answer" }).click();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(dialog.locator("[data-user-message]")).toHaveCount(1);
  await expect(
    dialog.getByRole("region", { name: "CareOS conversation" }),
  ).toBeFocused();
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
  await page.locator(".careos-launcher").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Clear", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Find receipt", exact: true }),
  ).toBeDisabled();
  restoring.release();
  await expect(
    dialog.getByRole("button", { name: "Clear", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(dialog.locator("article")).toHaveCount(0);
  expect(state.inputs).toHaveLength(0);
});

test("source disclosure keeps focus and reading position through expansion", async ({
  page,
}) => {
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
  const { dialog, transcript } = await open(page);
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
  const scrollTop = await transcript.evaluate((node) => node.scrollTop);
  await dialog.getByRole("button", { name: "Expand assistant" }).click();
  expect(
    Math.abs((await transcript.evaluate((node) => node.scrollTop)) - scrollTop),
  ).toBeLessThan(3);
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
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(dialog.locator("article")).toHaveCount(0);
  expect(state.inputs).toHaveLength(1);
});
