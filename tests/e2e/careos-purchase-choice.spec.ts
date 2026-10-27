import { expect, test, type Page } from "@playwright/test";
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
  "This earlier choice is inactive. Ask a new question to continue.";
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
      saved.turns.push(result);
      await route.fulfill({ json: result });
    } else {
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
  await page.locator(".careos-launcher").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "Legacy speaker answer without purchase choices. Injected UI proof only.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Find receipt", exact: true }),
  ).toBeEnabled();
  return { dialog, composer: dialog.getByLabel("Ask about your purchase") };
}

// Catch accidental browser-local date conversion (the stored dates are UTC).
test.use({ timezoneId: "America/Los_Angeles" });

test("explicit purchase choice creates one new scoped follow-up and leaves the historical selector inert (injected UI transport)", async ({
  page,
}) => {
  const state = await transport(page);
  const { dialog, composer } = await open(page);
  await expect(
    dialog.getByRole("group", { name: "Choose a purchase" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(speakerHref);
  expect(state.inputs).toHaveLength(0);
  await composer.fill(originalQuestion);
  await composer.press("Enter");
  const selection = dialog
    .locator("article")
    .filter({ hasText: selectionText });
  const group = selection.getByRole("group", { name: "Choose a purchase" });
  await expect(group).toBeVisible();
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(0)).not.toBeChecked();
  await expect(radios.nth(1)).not.toBeChecked();
  const sampleRadio = group.getByRole("radio", {
    name: "Everyday headphones · F-01 Oct 18, 2026 · Sample · PC-000201",
    exact: true,
  });
  await expect(sampleRadio).toBeVisible();
  await expect(
    group.getByRole("radio", {
      name: "Everyday headphones · F-01 Oct 22, 2026 · Verified Sandbox · PC-009201",
      exact: true,
    }),
  ).toBeVisible();
  const proceed = group.getByRole("button", {
    name: "Use this purchase and continue",
    exact: true,
  });
  await expect(proceed).toBeDisabled();
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

  await sampleRadio.focus();
  await sampleRadio.press("Space");
  await expect(sampleRadio).toBeChecked();
  await expect(proceed).toBeEnabled();
  await expect(page).toHaveURL(speakerHref);
  await expect(dialog.locator("strong")).toHaveText(
    "Everywhere speaker · F-03",
  );
  expect(state.inputs).toHaveLength(1);
  await proceed.focus();
  await proceed.press("Enter");
  await state.secondReceived.promise;
  const [original, followUp] = state.inputs;
  expect(followUp.requestId).not.toBe(original.requestId);
  expect(original.twinId).toBe(speaker.twinId);
  expect(followUp.twinId).toBe(sample.twinId);
  expect(followUp.message).toBe(originalQuestion);
  expect(followUp.message).toBe(original.message);
  expect(followUp.revision).toBeGreaterThan(original.revision);
  await expect(radios.nth(0)).toBeDisabled();
  await expect(radios.nth(1)).toBeDisabled();
  await expect(proceed).toBeDisabled();
  await expect(
    selection.getByText(inactiveNote, { exact: true }),
  ).toBeVisible();
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
  await expect(page).toHaveURL(sampleHref);
  await expect(dialog.locator("strong")).toHaveText(
    "Everyday headphones · F-01",
  );
  await expect(proceed).toBeDisabled();
  await expect(radios.nth(0)).toBeDisabled();
  await selection
    .locator("form")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(state.inputs).toHaveLength(2);

  await page.reload();
  await page.locator(".careos-launcher").click();
  await expect(
    dialog.getByRole("link", { name: "Open receipt", exact: true }),
  ).toHaveAttribute("href", receiptHref);
  const restored = dialog.getByRole("group", { name: "Choose a purchase" });
  await expect(restored.getByRole("radio").nth(0)).toBeDisabled();
  await expect(restored.getByRole("radio").nth(1)).toBeDisabled();
  await expect(
    restored.getByRole("button", {
      name: "Use this purchase and continue",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.inputs).toHaveLength(2);
});

test("a new question retires old choices; summaries expose one primary action and More options (injected UI transport)", async ({
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
  const group = selection.getByRole("group", { name: "Choose a purchase" });
  await expect(group.getByRole("radio")).toHaveCount(2);
  await group.getByRole("radio").nth(0).check();
  await composer.fill("Summarize the speaker instead.");
  await composer.press("Enter");
  await state.secondReceived.promise;
  expect(state.inputs[1].twinId).toBe(speaker.twinId);
  await expect(page).toHaveURL(speakerHref);
  await expect(group.getByRole("radio").nth(0)).toBeDisabled();
  await expect(group.getByRole("radio").nth(1)).toBeDisabled();
  await expect(
    group.getByRole("button", {
      name: "Use this purchase and continue",
      exact: true,
    }),
  ).toBeDisabled();
  state.secondReply.release();

  const summary = dialog.locator("article").filter({
    hasText: "Injected speaker summary. Synthetic UI proof only.",
  });
  await expect(
    summary.getByRole("link", { name: "View purchase", exact: true }),
  ).toHaveAttribute("href", speakerHref);
  await expect(summary.getByRole("link")).toHaveCount(1);
  const more = summary.locator("summary").filter({ hasText: /^More options$/ });
  await expect(more).toBeVisible();
  await more.click();
  await expect(
    summary.getByRole("link", { name: "Review documents", exact: true }),
  ).toHaveAttribute("href", `${speakerHref}#documents-heading`);
  await expect(
    summary.getByRole("link", { name: "Review recorded history", exact: true }),
  ).toHaveAttribute("href", `${speakerHref}#history-heading`);
  await expect(summary.getByRole("link")).toHaveCount(3);
  await expect(
    selection.getByText(inactiveNote, { exact: true }),
  ).toBeVisible();
  await expect(group.getByRole("radio").nth(0)).toBeDisabled();
  expect(state.inputs).toHaveLength(2);
});
