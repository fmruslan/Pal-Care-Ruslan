import { test, expect, type Page } from "@playwright/test";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
} from "../../scripts/north-language-browser";
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

test("language runner handles a closing page during click without abandoning its response wait (injected, zero provider calls)", async ({
  page,
}) => {
  await page.route("**/language-click-failure", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<input type="search" aria-label="Search products and documents"><button>Ask North Star</button>',
    }),
  );
  await page.goto("/language-click-failure");
  const closing: Promise<void>[] = [];
  const interruptedPage = new Proxy(page, {
    get(target, key) {
      if (key === "waitForResponse") {
        return (...args: Parameters<Page["waitForResponse"]>) => {
          const response = target.waitForResponse(...args);
          // Close at the exact listener-before-click boundary, without a timer
          // or changing action/response deadlines. Both promises must be owned.
          closing.push(target.close());
          return response;
        };
      }
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await expect(
    submitLanguageTurn(interruptedPage, "Keep this failed click unsent"),
  ).rejects.toThrow();
  await Promise.all(closing);
  expect(closing).toHaveLength(1);
});

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

test("language runner restores the exact previous saved result and all visible purchase IDs without another turn POST (injected, zero provider calls)", async ({
  page,
}) => {
  // More than the initial ten rows exercises the real Show more purchases
  // control. Table presentation also mounts a hidden responsive alternative.
  const data = {
    ...demoData,
    twins: [
      ...demoData.twins,
      ...Array.from({ length: 8 }, (_, index) => ({
        ...demoData.twins[0],
        id: `00000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
      })),
    ],
  };
  const firstMessage = "Show every saved purchase as a table";
  const secondMessage = "Only Kitchen purchases now";
  const inputs: string[] = [];
  const turnPosts: string[] = [];
  const turnPath =
    /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(turns|interpret)$/;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      turnPath.test(new URL(request.url()).pathname)
    ) {
      turnPosts.push(request.postDataJSON().requestId);
    }
  });
  await page.route(turnPath, async (route) => {
    const input = route.request().postDataJSON();
    inputs.push(input.message);
    expect([firstMessage, secondMessage]).toContain(input.message);
    const result = querySavedRecords(data, {
      ...emptyRecordsQuery("2026-11-06"),
      format: "table",
      categories: input.message === firstMessage ? [] : ["Kitchen"],
    });
    await route.fulfill({
      json: {
        requestId: input.requestId,
        message: input.message,
        answer: recordsAnswer(result, input.revision),
      },
    });
  });
  await page.goto("/dashboard");
  const firstResponse = await submitLanguageTurn(page, firstMessage);
  expect(firstResponse.ok()).toBe(true);
  const first = await firstResponse.json();
  await expect(
    page.locator(
      `[data-native-north-result][data-request-id="${first.requestId}"]`,
    ),
  ).toBeVisible();
  const secondResponse = await submitLanguageTurn(page, secondMessage);
  expect(secondResponse.ok()).toBe(true);
  const second = await secondResponse.json();
  const latest = page.locator(
    `[data-native-north-result][data-request-id="${second.requestId}"]`,
  );
  await expect(latest).toBeVisible();
  await expect
    .poll(() =>
      latest
        .locator('a[href^="/vault/"]')
        .filter({ visible: true })
        .evaluateAll((links) => [
          ...new Set(links.map((link) => link.getAttribute("href"))),
        ]),
    )
    .toEqual(["/vault/00000000-0000-4000-8000-000000000202"]);
  const postsBefore = [...turnPosts];
  expect(postsBefore).toEqual([first.requestId, second.requestId]);

  const expectedIds = data.twins.map((twin) => twin.id).sort();
  expect(expectedIds).toHaveLength(12);
  const evidence = await verifyLanguageHistory(
    page,
    first.requestId,
    expectedIds,
  );
  expect(evidence).toEqual({
    requestId: first.requestId,
    renderedIds: expectedIds,
    attemptedWrites: [],
  });
  await expect(latest).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Show more purchases \(/ }),
  ).toHaveCount(0);
  expect(turnPosts).toEqual(postsBefore);
  expect(inputs).toEqual([firstMessage, secondMessage]);
});
