import { expect, test } from "@playwright/test";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
  selectLanguageHistory,
} from "../../scripts/north-language-browser";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  answerConversationTurn,
  conversationPlanSchema,
} from "../../src/lib/careos/records/conversation-service";
import type { CareTurn } from "../../src/lib/careos/contracts";
import { withTenProductFixtures } from "../../src/lib/care/demo/catalog";

test("recorded chart restoration and no-new-chart instruction use original SDK state, not fresh creation (zero provider)", async ({
  page,
}) => {
  test.setTimeout(90000);
  const history: CareTurn[] = [];
  await page.route(
    /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(turns|interpret)$/,
    async (route) => {
      const input = route.request().postDataJSON();
      const q = emptyRecordsQuery("2026-11-08");
      const { version, timezone, referenceDate, ...query } = q;
      void version;
      void timezone;
      void referenceDate;
      const discuss = input.message.includes("Explain it without");
      const restore = input.message.startsWith("Go back");
      const proposal = conversationPlanSchema.parse({
        task: restore ? "restore" : "records",
        relation: restore || discuss ? "followup" : "fresh",
        query: {
          ...query,
          outcome: "query",
          operation: "breakdown",
          format: "chart",
          categories: [
            input.message.includes("Computing") ? "Computing" : "Audio",
          ],
        },
        comparison: null,
        productSearch: "",
        productAction: discuss ? "explain" : "summary",
        careQuestion: "",
        clarification: "",
      });
      const answer = await answerConversationTurn({
        input,
        history,
        load: async () => demoData,
        interpret: async () => proposal,
        knowledge: async () => [],
        model: {
          classify: async () => {
            throw Error("no provider");
          },
          explain: async () => {
            throw Error("no provider");
          },
        },
        call: async () => {
          throw Error("no provider");
        },
      });
      const turn = {
        requestId: input.requestId,
        message: input.message,
        answer,
      };
      // Simulate PostgreSQL JSONB key ordering independently of the first HTTP
      // response. The original saved result's meaning/identity is unchanged.
      history.push(
        JSON.parse(
          JSON.stringify(turn, (_key, value) =>
            value && !Array.isArray(value) && typeof value === "object"
              ? Object.fromEntries(
                  Object.entries(value).sort(([a], [b]) => b.localeCompare(a)),
                )
              : value,
          ),
        ),
      );
      await route.fulfill({ json: turn });
    },
  );
  await page.goto("/dashboard");
  const studio = page.getByTestId("customer-studio");
  const readback = async () =>
    JSON.parse((await studio.getAttribute("data-native-readback")) || "null");
  const audio = await (
    await submitLanguageTurn(page, "Show my Audio purchases as a chart")
  ).json();
  await expect
    .poll(async () => (await readback())?.requestId, { timeout: 25000 })
    .toBe(audio.requestId);
  const original = await readback();
  const computing = await (
    await submitLanguageTurn(page, "Show my Computing purchases as a chart")
  ).json();
  await expect
    .poll(async () => (await readback())?.requestId, { timeout: 25000 })
    .toBe(computing.requestId);
  expect((await readback()).recordIds).not.toEqual(original.recordIds);
  const restored = await (
    await submitLanguageTurn(
      page,
      "Go back to the previous chart result without rerunning it or making a new chart.",
    )
  ).json();
  await expect
    .poll(async () => (await readback())?.requestId, { timeout: 25000 })
    .toBe(restored.requestId);
  const actual = await readback();
  expect(actual.nativeDisplaysVerified).toBe(true);
  expect(actual.state).toEqual(original.state);
  expect(actual.recordIds).toEqual(original.recordIds);
  await expect(
    page.getByText(
      "Original saved native state restored and verified in Insights",
      { exact: false },
    ),
  ).toBeVisible();
  const before = await studio.getAttribute("data-native-readback");
  const explained = await (
    await submitLanguageTurn(
      page,
      "What purchase scope does this selected result use? Explain it without creating another chart.",
    )
  ).json();
  const result = page.locator(
    `[data-native-north-result][data-request-id="${explained.requestId}"]`,
  );
  await expect(result).toContainText("Audio only");
  await expect(result).toContainText("$218.00");
  await expect(
    result.getByRole("button", { name: "Show native chart" }),
  ).toHaveCount(0);
  expect(await studio.getAttribute("data-native-readback")).toBe(before);
  const manual = await selectLanguageHistory(
    page,
    audio.requestId,
    "Show my Audio purchases as a chart",
    original.recordIds,
  );
  expect(manual.attemptedWrites).toEqual([]);
  expect(await studio.getAttribute("data-native-readback")).toBe(before);
  // A full reload deliberately loses the nonpersistent native snapshot. The
  // same owned result must now fail visibly, never recreate the chart.
  await page.goto("/dashboard");
  await page.reload();
  await submitLanguageTurn(
    page,
    "Go back to the previous chart result without rerunning it or making a new chart.",
  );
  await expect(
    page.getByText(
      "The original verified native state is unavailable or restoration could not be verified.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(await studio.getAttribute("data-native-readback")).toBeNull();
  await expect(
    studio
      .locator(".ag-studio-layout-widget-title")
      .filter({ hasText: "Recorded value (USD)" }),
  ).toHaveCount(0);
});

test("recorded receipt, scheduling, comparisons and pending-eCheck answers render exact evidence without financial/native actions (injected)", async ({
  page,
}) => {
  const history: CareTurn[] = [];
  const data = withTenProductFixtures(structuredClone(demoData));
  await page.route(
    /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(turns|interpret)$/,
    async (route) => {
      const input = route.request().postDataJSON();
      const { version, timezone, referenceDate, ...query } =
        emptyRecordsQuery("2026-11-08");
      void version;
      void timezone;
      void referenceDate;
      const receipt = input.message.startsWith("Find my Sample");
      const comparison =
        input.message.startsWith("Ignore those") ||
        input.message.startsWith("Which of those");
      const pending = input.message.startsWith("Is the pending");
      const proposal = conversationPlanSchema.parse({
        task: receipt
          ? "product"
          : comparison
            ? "records"
            : pending
              ? "aftercare"
              : "unsupported",
        relation: "fresh",
        query: {
          ...query,
          outcome: "query",
          ...(receipt
            ? { origin: "sample", from: "2026-10-18", to: "2026-10-18" }
            : comparison
              ? {
                  operation: "compare",
                  format: "table",
                  from: "2026-10-01",
                  to: "2026-10-15",
                }
              : {}),
        },
        comparison: comparison
          ? { from: "2026-10-16", to: "2026-10-31" }
          : null,
        productSearch: receipt ? "Forma F-01" : "",
        productAction: receipt ? "receipt" : pending ? "payment" : "summary",
        careQuestion: "",
        clarification: "",
      });
      const answer = await answerConversationTurn({
        input,
        history,
        load: async () => data,
        interpret: async () => proposal,
        knowledge: async () => [],
        model: {
          classify: async () => {
            throw Error("no provider");
          },
          explain: async () => {
            throw Error("no provider");
          },
        },
        call: async () => {
          throw Error("no provider");
        },
      });
      const turn = {
        requestId: input.requestId,
        message: input.message,
        answer,
      };
      history.push(turn);
      await route.fulfill({ json: turn });
    },
  );
  await page.goto("/dashboard");
  const inputs = [
    "Find my Sample Forma F-01 headphones receipt from 2026-10-18. It is not the verified Sandbox purchase.",
    "Tomorrow at 09:00 UTC, automatically show me that same result and remind me to check it.",
    "Do that tomorrow, yesterday. If you cannot schedule or send reminders, say so explicitly; don't just ask me to choose a date.",
    "Ignore those filters. Compare all purchases from 2026-10-01 through 2026-10-15 against 2026-10-16 through 2026-10-31. Separate Sample and Verified Sandbox and exclude unpriced references from spending.",
    "Which of those two periods had more recorded Sample spending, and by how much? Keep the same periods.",
    "Is the pending eCheck a verified completed purchase? Do not treat it as completed without saved provider evidence.",
  ];
  for (const [i, message] of inputs.entries()) {
    const turn = await (await submitLanguageTurn(page, message)).json();
    const result = page.locator(
      `[data-native-north-result][data-request-id="${turn.requestId}"]`,
    );
    await expect(result).toBeVisible();
    if (i === 0) {
      await expect(
        result
          .locator('a[href="/documents/00000000-0000-4000-8000-000000000301"]')
          .first(),
      ).toBeVisible();
      expect(turn.answer.context).toMatchObject({
        twinId: "00000000-0000-4000-8000-000000000201",
        origin: "sample",
        purchasedOn: "2026-10-18",
      });
    } else if (i < 3)
      await expect(result).toContainText(
        "cannot schedule reminders or deliver future notifications",
      );
    else if (i < 5) {
      await expect(result).toContainText(
        "2026-10-16 through 2026-10-31 had $2,626.94 more recorded Sample value",
      );
      await expect(result).toContainText(
        "Comparison period: 2026-10-16 through 2026-10-31",
      );
      await expect(result).not.toContainText("Previous period");
    } else {
      await expect(result).toContainText("completion remains unverified");
      await expect(result.locator("[data-records-result]")).toHaveCount(0);
      await expect(
        result.getByRole("link", { name: "Open receipt" }),
      ).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});

test("identical native charts publish fresh request-correlated SDK proof and History never re-executes it (injected, zero provider calls)", async ({
  page,
}) => {
  test.setTimeout(60000);
  const requests: string[] = [];
  await page.route(
    /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(turns|interpret)$/,
    async (route) => {
      const input = route.request().postDataJSON();
      requests.push(input.requestId);
      const result = querySavedRecords(demoData, {
        ...emptyRecordsQuery("2026-11-06"),
        categories: ["Audio"],
        format:
          input.message === "Show my Audio purchases in a table"
            ? "table"
            : "chart",
      });
      await route.fulfill({
        json: {
          requestId: input.requestId,
          message: input.message,
          answer: recordsAnswer(result, input.revision),
        },
      });
    },
  );
  await page.goto("/dashboard");
  const proof = page.getByTestId("customer-studio");
  let previousGeneration = 0;
  for (let n = 0; n < 2; n++) {
    const response = await submitLanguageTurn(
      page,
      "Show my Audio purchases as a chart",
    );
    expect(response.ok()).toBe(true);
    const turn = await response.json();
    await expect(page).toHaveURL(/\/insights$/);
    await expect
      .poll(
        async () => {
          const raw = await proof.getAttribute("data-native-readback");
          return raw ? JSON.parse(raw).requestId : null;
        },
        { timeout: 25000 },
      )
      .toBe(turn.requestId);
    const readback = JSON.parse(
      (await proof.getAttribute("data-native-readback"))!,
    );
    expect(readback.executionGeneration).toBeGreaterThan(previousGeneration);
    expect(readback.nativeDisplaysVerified).toBe(true);
    expect(readback.recordIds.sort()).toEqual(
      turn.answer.recordsResult.records
        .map((record: { id: string }) => record.id)
        .sort(),
    );
    expect(readback.state.selectedPageId).toBe("purchases");
    previousGeneration = readback.executionGeneration;
  }
  const secondRequestId = requests[1];
  const before = await proof.getAttribute("data-native-readback");
  const table = await submitLanguageTurn(
    page,
    "Show my Audio purchases in a table",
  );
  const tableTurn = await table.json();
  await expect(
    page.locator(
      `[data-native-north-result][data-request-id="${tableTurn.requestId}"]`,
    ),
  ).toBeVisible();
  const history = await verifyLanguageHistory(
    page,
    secondRequestId,
    tableTurn.answer.recordsResult.records.map(
      (record: { id: string }) => record.id,
    ),
  );
  expect(history.attemptedWrites).toEqual([]);
  expect(requests).toHaveLength(3);
  expect(await proof.getAttribute("data-native-readback")).toBe(before);
});
