import { test, expect } from "@playwright/test";
import { submitLanguageTurn } from "../../scripts/north-language-browser";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { demoData } from "../../src/lib/demo/fixtures";

for (const kind of ["search", "follow-up"] as const) {
  test(`language runner waits for a late ${kind} input without dispatching early`, async ({
    page,
  }) => {
    const input = "Keep this exact question unchanged";
    let dispatches = 0;
    await page.route("**/language-readiness-check", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body><main id="mount"></main></body></html>',
      }),
    );
    await page.route(
      "**/api/careos/records/conversations/readiness/turns",
      async (route) => {
        dispatches++;
        expect(route.request().postDataJSON().message).toBe(input);
        await route.fulfill({ json: { ok: true } });
      },
    );
    await page.goto("/language-readiness-check");
    const submitted = submitLanguageTurn(page, input);
    expect(dispatches).toBe(0);
    await page.evaluate((kind) => {
      const form = document.createElement("form");
      const field = document.createElement("input");
      field.type = kind === "search" ? "search" : "text";
      field.setAttribute(
        "aria-label",
        kind === "search"
          ? "Search products and documents"
          : "Ask about your purchases",
      );
      const button = document.createElement("button");
      button.textContent =
        kind === "search" ? "Ask North Star" : "Send to North Star";
      form.append(field, button);
      form.onsubmit = (event) => {
        event.preventDefault();
        void fetch("/api/careos/records/conversations/readiness/turns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: field.value }),
        });
      };
      document.getElementById("mount")!.append(form);
    }, kind);
    expect((await submitted).ok()).toBe(true);
    expect(dispatches).toBe(1);
  });
}

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
