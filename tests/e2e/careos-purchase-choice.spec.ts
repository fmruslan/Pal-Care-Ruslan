import { expect, test, type Locator, type Page } from "@playwright/test";
import type {
  CareContext,
  CareTurn,
  Conversation,
  PurchaseChoice,
  TurnInput,
} from "../../src/lib/careos/contracts";

// Injected browser-transport proof only: no model, database write, or PayPal call.
// The speaker/sample headphones/receipt IDs are the real bundled fixture IDs.
const speaker: CareContext = {
  twinId: "00000000-0000-4000-8000-000000000203",
  name: "Everywhere speaker",
  model: "F-03",
  origin: "sample",
};
const sample: CareContext = {
  twinId: "00000000-0000-4000-8000-000000000201",
  name: "Everyday headphones",
  model: "F-01",
  origin: "sample",
};
const speakerHref = `/vault/${speaker.twinId}`;
const sampleHref = `/vault/${sample.twinId}`;
const receiptHref = "/documents/00000000-0000-4000-8000-000000000301";
const originalQuestion =
  "Where is my headphones receipt?\nPlease use the saved purchase.";
const selectionText =
  "Synthetic purchase-choice result for UI testing only. Choose a saved purchase.";
const inactiveNote =
  "Purchase choice closed. You can ask something else or change context above.";
const choices: PurchaseChoice[] = [
  { context: sample, purchasedOn: "2026-10-18", provenance: "Sample" },
  {
    // Deliberately fake, distinguishable Sandbox metadata; never select/navigate
    // to this UUID or present this injection as actual verified payment evidence.
    context: {
      ...sample,
      twinId: "00000000-0000-4000-8000-000000009201",
      origin: "sandbox",
    },
    purchasedOn: "2026-10-22",
    provenance: "Verified Sandbox",
  },
];

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function transport(page: Page) {
  const saved: Conversation = {
    id: "00000000-0000-4000-8000-000000000990",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    turns: [
      {
        requestId: "00000000-0000-4000-8000-000000000991",
        message: "Earlier speaker question",
        answer: {
          outcome: "answered",
          mode: "deterministic",
          context: speaker,
          revision: 1,
          text: "Legacy speaker answer without purchase choices. Injected UI proof only.",
          steps: [],
          sources: [],
          actions: [],
        },
      },
    ],
  };
  const state = {
    saved,
    inputs: [] as TurnInput[],
    secondReceived: gate(),
    secondReply: gate(),
    loseSecond: false,
    secondResult: null as CareTurn | null,
    reads: 0,
    summary: false,
  };
  await page.addInitScript((id) => {
    sessionStorage.setItem("palcare-careos-conversation", id);
  }, saved.id);
  await page.route("**/api/careos/conversations**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().endsWith("/turns")) {
      const input = request.postDataJSON() as TurnInput;
      state.inputs.push(input);
      const selecting = state.inputs.length === 1;
      if (state.inputs.length === 2) {
        state.secondReceived.release();
        await state.secondReply.promise;
      }
      const result: CareTurn = {
        requestId: input.requestId,
        message: input.message,
        answer: {
          outcome: selecting ? "selection" : "answered",
          mode: "deterministic",
          context: selecting || state.summary ? speaker : sample,
          revision: input.revision,
          text: selecting
            ? selectionText
            : state.summary
              ? "Injected speaker summary. Synthetic UI proof only."
              : "Receipt for the deliberately selected sample purchase. Injected UI proof only.",
          steps: [],
          sources: [],
          actions: selecting
            ? [{ label: "Legacy navigation fallback", href: sampleHref }]
            : state.summary
              ? [
                  { label: "View purchase", href: speakerHref },
                  {
                    label: "Review documents",
                    href: `${speakerHref}#documents-heading`,
                  },
                  {
                    label: "Review recorded history",
                    href: `${speakerHref}#history-heading`,
                  },
                ]
              : [{ label: "Open receipt", href: receiptHref }],
          ...(selecting ? { purchaseChoices: choices } : {}),
        },
      };
      if (state.inputs.length === 2) {
        state.secondResult = result;
        if (state.loseSecond) {
          await route.abort("failed");
          return;
        }
      }
      saved.turns.push(result);
      await route.fulfill({ json: result });
    } else {
      if (request.method() === "GET") state.reads++;
      await route.fulfill({
        status: request.method() === "POST" ? 201 : 200,
        json: saved,
      });
    }
  });
  return state;
}

async function open(page: Page) {
  await page.goto(speakerHref);
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await expect(
    dialog.getByText(
      "Legacy speaker answer without purchase choices. Injected UI proof only.",
      { exact: true },
    ),
  ).toBeVisible();
  const composer = dialog.getByLabel("Ask about your purchases", {
    exact: true,
  });
  await expect(composer).toBeEditable();
  return { dialog, composer };
}

async function selectHistory(
  dialog: Locator,
  saved: Conversation,
  requestId: string,
) {
  const turn = saved.turns.find((turn) => turn.requestId === requestId);
  expect(turn, "the original owned turn remains saved").toBeDefined();
  // A direct choice deliberately reuses the question text with a new UUID.
  // Resolve the requested UUID in saved order rather than selecting whichever
  // same-message result happens to be first without checking its identity.
  const sameMessage = saved.turns.filter(
    (candidate) => candidate.message === turn!.message,
  );
  const index = sameMessage.findIndex((turn) => turn.requestId === requestId);
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  const entries = dialog
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: turn!.message, exact: true });
  await expect(entries).toHaveCount(sameMessage.length);
  await entries.nth(index).click();
  await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
    "data-request-id",
    requestId,
  );
  await expect(dialog.locator("[data-user-message]")).toHaveText(turn!.message);
}

// Catch accidental browser-local date conversion (the stored dates are UTC).
test.use({ timezoneId: "America/Los_Angeles" });

test("one direct dated choice creates exactly one scoped follow-up without navigation; history has no dead controls (injected UI transport)", async ({
  page,
}) => {
  const state = await transport(page);
  const { dialog, composer } = await open(page);
  await expect(
    dialog.getByRole("region", { name: "Choose a purchase" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(speakerHref);
  expect(state.inputs).toHaveLength(0);
  await composer.fill(originalQuestion);
  await composer.press("Enter");
  const selection = dialog
    .locator("article")
    .filter({ hasText: selectionText });
  const group = selection.getByRole("region", { name: "Choose a purchase" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio")).toHaveCount(0);
  await expect(group.getByRole("button")).toHaveCount(3);
  const sampleChoice = group.getByRole("button", {
    name: "Everyday headphones · F-01 Oct 18, 2026 · Sample · PC-000201",
    exact: true,
  });
  await expect(sampleChoice).toBeVisible();
  await expect(
    group.getByRole("button", {
      name: "Everyday headphones · F-01 Oct 22, 2026 · Verified Sandbox · PC-009201",
      exact: true,
    }),
  ).toBeVisible();
  await expect(group.getByRole("button", { name: /continue/i })).toHaveCount(0);
  await expect(selection.getByRole("link")).toHaveCount(0);
  await expect(selection.getByRole("status")).toHaveCount(0);
  await expect(dialog.locator("strong")).toHaveText(
    "Everywhere speaker · F-03",
  );
  await expect(page).toHaveURL(speakerHref);
  expect(state.inputs).toHaveLength(1);

  await page.screenshot({
    path: test.info().outputPath("purchase-choices.png"),
  });

  await sampleChoice.focus();
  await sampleChoice.press("Enter");
  await state.secondReceived.promise;
  const [original, followUp] = state.inputs;
  expect(followUp.requestId).not.toBe(original.requestId);
  expect(original.twinId).toBe(speaker.twinId);
  expect(followUp.twinId).toBe(sample.twinId);
  expect(followUp.message).toBe(originalQuestion);
  expect(followUp.message).toBe(original.message);
  expect(followUp.revision).toBeGreaterThan(original.revision);
  await expect(group).toHaveCount(0);
  // Only the active pending follow-up is rendered; the immutable selection
  // remains available through History, not alongside the new answer.
  await expect(selection).toHaveCount(0);
  await expect(dialog.locator("article[data-request-id]")).toHaveCount(1);
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    followUp.requestId,
  );
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    originalQuestion,
  );
  await expect(
    dialog.getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveCount(0);

  state.secondReply.release();
  const answer = dialog.locator("article").filter({
    hasText:
      "Receipt for the deliberately selected sample purchase. Injected UI proof only.",
  });
  await expect(
    answer.getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveAttribute("href", receiptHref);
  await expect(
    dialog.getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveCount(1);
  await expect(page).toHaveURL(speakerHref);
  await expect(dialog.locator("strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  await expect(selection).toHaveCount(0);
  await expect(answer).toHaveAttribute("data-request-id", followUp.requestId);
  expect(state.inputs).toHaveLength(2);

  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveAttribute("href", receiptHref);
  await expect(
    dialog.getByRole("region", { name: "Choose a purchase" }),
  ).toHaveCount(0);
  await selectHistory(dialog, state.saved, original.requestId);
  await expect(
    selection.getByText(inactiveNote, { exact: true }),
  ).toBeVisible();
  await expect(selection.getByRole("button")).toHaveCount(0);
  await expect(dialog.locator("strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  await expect(page).toHaveURL(speakerHref);
  expect(state.inputs).toHaveLength(2);
});

test("a new question retires old choices; summary actions retain their exact source destinations (injected UI transport)", async ({
  page,
}) => {
  const state = await transport(page);
  state.summary = true;
  const { dialog, composer } = await open(page);
  await composer.fill(originalQuestion);
  await composer.press("Enter");
  const selection = dialog
    .locator("article")
    .filter({ hasText: selectionText });
  const group = selection.getByRole("region", { name: "Choose a purchase" });
  await expect(group.getByRole("button")).toHaveCount(3);
  await composer.fill("Summarize the speaker instead.");
  await expect(group).toHaveCount(0);
  await expect(
    selection.getByText(inactiveNote, { exact: true }),
  ).toBeVisible();
  expect(state.inputs).toHaveLength(1);
  await composer.press("Enter");
  await state.secondReceived.promise;
  expect(state.inputs[1].twinId).toBe(speaker.twinId);
  await expect(page).toHaveURL(speakerHref);
  await expect(selection.getByRole("button")).toHaveCount(0);
  state.secondReply.release();

  const summary = dialog.locator("article").filter({
    hasText: "Injected speaker summary. Synthetic UI proof only.",
  });
  await expect(
    summary.getByRole("link", { name: "View purchase", exact: true }),
  ).toHaveAttribute("href", speakerHref);
  await expect(
    summary.getByRole("link", { name: "Review documents", exact: true }),
  ).toHaveAttribute("href", `${speakerHref}#documents-heading`);
  await expect(
    summary.getByRole("link", { name: "Review recorded history", exact: true }),
  ).toHaveAttribute("href", `${speakerHref}#history-heading`);
  await expect(summary.getByRole("link")).toHaveCount(3);
  await selectHistory(dialog, state.saved, state.inputs[0].requestId);
  await expect(
    selection.getByText(inactiveNote, { exact: true }),
  ).toBeVisible();
  await expect(selection.getByRole("button")).toHaveCount(0);
  expect(state.inputs).toHaveLength(2);
});

test("dismiss a clarification without changing history, context or the next draft (injected UI transport)", async ({
  page,
}) => {
  const state = await transport(page);
  const { dialog, composer } = await open(page);
  await composer.fill(originalQuestion);
  await composer.press("Enter");
  const choice = dialog.getByRole("region", { name: "Choose a purchase" });
  await expect(choice).toBeVisible();
  await choice.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(choice).toHaveCount(0);
  await expect(composer).toBeFocused();
  await composer.fill("Keep this different question unsent");
  await expect(composer).toHaveValue("Keep this different question unsent");
  await expect(dialog.getByText(inactiveNote, { exact: true })).toBeVisible();
  await expect(dialog.locator("[data-user-message]")).toHaveText(
    originalQuestion,
  );
  await selectHistory(dialog, state.saved, state.saved.turns[0].requestId);
  await expect(dialog).toContainText(
    "Legacy speaker answer without purchase choices. Injected UI proof only.",
  );
  await selectHistory(dialog, state.saved, state.inputs[0].requestId);
  await expect(choice).toHaveCount(0);
  await expect(dialog.getByText(inactiveNote, { exact: true })).toBeVisible();
  await expect(dialog.locator("strong")).toHaveText(
    "Everywhere speaker · F-03",
  );
  await expect(page).toHaveURL(speakerHref);
  expect(state.inputs).toHaveLength(1);
  expect(state.saved.turns).toHaveLength(2);
});

test("a lost direct-choice answer keeps its new identity across reload and recovers only by read (injected UI transport)", async ({
  page,
}) => {
  const state = await transport(page);
  state.loseSecond = true;
  const { dialog, composer } = await open(page);
  await composer.fill(originalQuestion);
  await composer.press("Enter");
  await dialog
    .getByRole("region", { name: "Choose a purchase" })
    .getByRole("button", {
      name: "Everyday headphones · F-01 Oct 18, 2026 · Sample · PC-000201",
      exact: true,
    })
    .click();
  await state.secondReceived.promise;
  const [original, chosen] = state.inputs;
  expect(chosen.requestId).not.toBe(original.requestId);
  expect(chosen.message).toBe(original.message);
  expect(chosen.twinId).toBe(sample.twinId);
  state.secondReply.release();
  await expect(
    dialog.getByRole("button", { name: "Check for saved answer", exact: true }),
  ).toBeEnabled();
  await composer.fill("A draft while the answer is uncertain");
  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
    "data-request-id",
    chosen.requestId,
  );
  await expect(composer).toHaveValue("A draft while the answer is uncertain");
  await expect(
    dialog.getByRole("region", { name: "Choose a purchase" }),
  ).toHaveCount(0);
  expect(state.secondResult).not.toBeNull();
  state.saved.turns.push(state.secondResult!);
  const reads = state.reads;
  await dialog
    .getByRole("button", { name: "Check for saved answer", exact: true })
    .click();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(
    dialog.getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveAttribute("href", receiptHref);
  expect(state.reads).toBeGreaterThan(reads);
  expect(state.inputs).toEqual([original, chosen]);
  await expect(page).toHaveURL(speakerHref);
});
