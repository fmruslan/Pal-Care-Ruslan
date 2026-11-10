import { test, expect, type Page, type Route } from "@playwright/test";

async function openNorth(page: Page) {
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  const restoreOpen = await page.evaluate(() => {
    try {
      return (
        JSON.parse(
          sessionStorage.getItem("palcare-north-workspace-v1") ?? "null",
        )?.open === true
      );
    } catch {
      return false;
    }
  });
  if (!restoreOpen && !(await dialog.isVisible())) {
    await page.getByRole("button", { name: "History", exact: true }).click();
    await dialog.getByRole("button", { name: "History", exact: true }).click();
  }
  await expect(dialog).toBeVisible();
  return dialog;
}

test("expired AI leaves saved pages and native analytics useful without bootstrap or scripted fallback", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(new URL(request.url()).pathname);
  });
  // Isolated injected transport only; no host authorization files are read/changed.
  await page.clock.install({ time: new Date(Date.now() + 2 * 86400000) });
  for (const path of ["/dashboard", "/vault", "/documents", "/insights"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const dialog = await openNorth(page);
    await expect(
      dialog.getByText("North’s AI access has expired.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog).toContainText(
      "You can still browse saved purchases and documents, or explore Insights yourself.",
    );
    await expect(
      dialog.getByRole("button", { name: "Send to North Star" }),
    ).toBeDisabled();
    const draft = dialog.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    });
    await expect(draft).toBeEditable();
    await draft.fill("Find receipt");
    await draft.press("Enter");
    await expect(draft).toHaveValue("Find receipt");
    await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Send to North Star" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Close North Star" }).click();
  }
  await page.getByText("Filters & sort", { exact: true }).click();
  const group = page.getByRole("group", { name: "Purchase evidence filters" });
  await expect(
    group.getByRole("button", { name: "All", exact: true }),
  ).toBeEnabled();
  await group.getByRole("button", { name: "Samples", exact: true }).click();
  await expect(
    group.getByRole("button", { name: "Samples", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-chart-widget canvas")
      .first(),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

for (const pending of [
  {
    kind: "care",
    path: "/dashboard",
    key: "palcare-careos-pending-v1",
  },
  {
    kind: "Insights",
    path: "/insights",
    key: "palcare-insights-pending-v1",
  },
] as const) {
  test(`expired AI preserves a first uncertain ${pending.kind} hint until Clear confirms its owned deletion (injected transport)`, async ({
    page,
  }) => {
    // Only the existing isolated Sol runtimes; never the private preview/provider.
    await page.clock.install({ time: new Date(Date.now() + 2 * 86400000) });
    const requests: { method: string; target: string }[] = [];
    const posts: string[] = [];
    let outcome: number | "network" = 503;
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    const intercept = async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({
        method: request.method(),
        target: `${url.pathname}${url.search}`,
      });
      if (outcome === "network") {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: outcome,
        json: {
          error:
            outcome === 404
              ? "careos_conversation_not_found"
              : outcome === 409
                ? "careos_turn_in_progress"
                : outcome === 403
                  ? "careos_forbidden"
                  : "careos_unavailable",
        },
      });
    };
    // Intercept both backends, including any unintended bootstrap/replay request.
    await page.route("**/api/careos/conversations**", intercept);
    await page.route("**/api/intelligence/customer/plan**", intercept);

    for (const failure of [503, 409, 403, "network"] as const) {
      await test.step(`${failure} retains the pending-only hint; confirmed missing permits an explicit retry`, async () => {
        outcome = failure;
        requests.length = 0;
        // A full navigation resets both hooks before every first Clear attempt.
        await page.goto(pending.path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const original = await page.evaluate(({ kind, key }) => {
          const requestId = crypto.randomUUID();
          const conversationId = crypto.randomUUID();
          const message = `Original ${kind} question with an unconfirmed result`;
          // Use the installed browser clock so this remains a valid 24-hour hint.
          const createdAt = Date.now();
          const value =
            kind === "care"
              ? {
                  input: { requestId, twinId: null, revision: 0, message },
                  context: null,
                  conversationId,
                  createdAt,
                }
              : { requestId, conversationId, message, createdAt };
          const raw = JSON.stringify(value);
          // Fixture-only tab state: no completed history or conversation index.
          sessionStorage.clear();
          sessionStorage.setItem(key, raw);
          return { requestId, conversationId, message, raw };
        }, pending);
        const target =
          pending.kind === "care"
            ? `/api/careos/conversations/${original.conversationId}`
            : `/api/intelligence/customer/plan?conversationId=${original.conversationId}`;
        const dialog = await openNorth(page);
        await expect(
          dialog.getByText("North’s AI access has expired.", { exact: true }),
        ).toBeVisible();
        await expect(dialog).toContainText(
          "You can still browse saved purchases and documents, or explore Insights yourself.",
        );
        const send = dialog.getByRole("button", {
          name: "Send to North Star",
          exact: true,
        });
        const draft = dialog.getByRole("textbox", {
          name: "Ask about your purchases",
          exact: true,
        });
        await draft.fill("Keep this new draft without sending or replaying");
        await draft.press("Enter");
        await dialog
          .locator("form")
          .evaluate((form: HTMLFormElement) => form.requestSubmit());
        await expect(send).toBeDisabled();
        await expect(draft).toHaveValue(
          "Keep this new draft without sending or replaying",
        );
        // Expired open skipped restoration: Clear must hydrate the orphan ID.
        await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
        expect(requests).toEqual([]);
        expect(posts).toEqual([]);
        expect(
          await page.evaluate(
            (key) => sessionStorage.getItem(key),
            pending.key,
          ),
        ).toBe(original.raw);
        expect(
          await page.evaluate(() => [
            sessionStorage.getItem("palcare-careos-conversation"),
            sessionStorage.getItem("palcare-insights-history-v1"),
          ]),
        ).toEqual([null, null]);

        const options = dialog.getByText("Conversation settings", {
          exact: true,
        });
        const clear = dialog.getByRole("button", {
          name: "Clear conversation history",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "History", exact: true })
          .click();
        await options.click();
        await expect(clear).toBeEnabled();
        await clear.click();
        await expect(dialog.getByRole("alert")).toBeVisible();
        await expect(dialog.getByRole("alert")).not.toBeEmpty();
        await expect(dialog.locator("[data-pending-question]")).toHaveAttribute(
          "data-request-id",
          original.requestId,
        );
        await expect(dialog.locator("[data-pending-question]")).toContainText(
          original.message,
        );
        expect(requests).toEqual([{ method: "DELETE", target }]);
        expect(
          await page.evaluate(
            (key) => sessionStorage.getItem(key),
            pending.key,
          ),
        ).toBe(original.raw);
        expect(posts).toEqual([]);
        await expect(send).toBeDisabled();

        // Only this exact JSON 404 is confirmed missing for customerPlanApi;
        // denial, a lease, network failure or a generic 404 is not that proof.
        outcome = 404;
        if (!(await clear.isVisible())) await options.click();
        await expect(clear).toBeEnabled();
        await clear.click();
        await expect(dialog.getByRole("alert")).toHaveCount(0);
        await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
        expect(requests).toEqual([
          { method: "DELETE", target },
          { method: "DELETE", target },
        ]);
        expect(
          await page.evaluate(
            (key) => sessionStorage.getItem(key),
            pending.key,
          ),
        ).toBeNull();
        expect(posts).toEqual([]);
        await expect(send).toBeDisabled();
        await expect(draft).toHaveValue(
          "Keep this new draft without sending or replaying",
        );
      });
    }
  });
}

test("an already open assistant disables AI work on expiry while provider-free saved records remain available", async ({
  page,
}) => {
  await page.goto("/insights");
  await expect(
    page.getByRole("button", { name: "My Purchases", exact: true }),
  ).toBeEnabled();
  const dialog = await openNorth(page);
  const input = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
  });
  await expect(input).toBeEnabled();
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      mutations.push(new URL(request.url()).pathname);
  });
  await page.clock.install();
  await page.clock.setSystemTime(new Date(Date.now() + 2 * 86400000));
  await page.clock.runFor(1100);
  await expect(
    dialog.getByText("North’s AI access has expired.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "You can still browse saved purchases and documents, or explore Insights yourself.",
  );
  await expect(input).toBeEditable();
  await input.fill("Show category chart in this workspace");
  await input.press("Enter");
  await expect(input).toHaveValue("Show category chart in this workspace");
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeDisabled();
  // A forced stale submit must still fail the synchronous expiry guard.
  await dialog
    .locator("form")
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  expect(mutations).toEqual([]);
  // Saved-library conversations are intentionally independent of AI authority.
  // This is an actual application read, not an exception for a model endpoint.
  await input.fill("Show my purchases");
  const savedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/careos\/records\/conversations\/[a-f0-9-]{36}\/turns$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Send to North Star" }).click();
  const response = await savedResponse;
  expect(response.ok()).toBe(true);
  const turn = await response.json();
  expect(turn.answer.mode).toBe("deterministic");
  expect(turn.answer.recordsResult.totals[0].amountMinor).toBe(30700);
  await expect(
    dialog.locator(
      `[data-request-id="${turn.requestId}"] [data-records-result]`,
    ),
  ).toBeVisible();
  expect(mutations.length).toBeGreaterThan(0);
  expect(
    mutations.every((path) =>
      /^\/api\/careos\/records\/conversations(?:\/[a-f0-9-]{36}\/turns)?$/.test(
        path,
      ),
    ),
  ).toBe(true);
});
