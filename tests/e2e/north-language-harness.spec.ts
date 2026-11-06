import { test, expect } from "@playwright/test";
import { submitLanguageTurn } from "../../scripts/north-language-browser";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { demoData } from "../../src/lib/demo/fixtures";

test("language runner uses both real inline composers and preserves exact questions (injected, zero provider calls)", async ({
  page,
}) => {
  const inputs: string[] = [];
  await page.route(
    /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(turns|interpret)$/,
    async (route) => {
      const input = route.request().postDataJSON();
      inputs.push(input.message);
      const result = querySavedRecords(demoData, {
        ...emptyRecordsQuery("2026-11-06"),
        categories: ["Audio"],
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
  for (const input of [
    "cn u find my audio purchses",
    "same thing but in a table pls",
  ]) {
    const response = await submitLanguageTurn(page, input);
    expect(response.ok()).toBe(true);
    const turn = await response.json();
    await expect(
      page.locator(
        `[data-native-north-result][data-request-id="${turn.requestId}"]`,
      ),
    ).toBeVisible();
  }
  expect(inputs).toEqual([
    "cn u find my audio purchses",
    "same thing but in a table pls",
  ]);
});
