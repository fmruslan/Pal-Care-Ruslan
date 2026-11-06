import { expect, test } from "@playwright/test";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
} from "../../scripts/north-language-browser";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { demoData } from "../../src/lib/demo/fixtures";

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
