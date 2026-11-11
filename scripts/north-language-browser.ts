import { expect, type Page, type Route } from "@playwright/test";

/** Same visible customer interaction for live runs and injected harness checks.
 * Does not decide authority, create a profile, or retry a request. */
export async function submitLanguageTurn(page: Page, message: string) {
  const search = page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
  const composer = page.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  // Database pages can finish navigation before their streamed inputs mount.
  // Choose only after an actual visible input exists, not an early DOM count.
  await expect(
    search.or(composer).filter({ visible: true }).first(),
  ).toBeVisible();
  // The floating panel no longer replaces page search. Use its active composer
  // when present, rather than clicking a page control underneath the sheet.
  const fromSearch = !(await composer.isVisible());
  await (fromSearch ? search : composer).fill(message);
  const button = page.getByRole("button", {
    name: fromSearch ? "Ask North Star" : "Send to North Star",
    exact: true,
  });
  await expect(button).toBeEnabled();
  // Attach rejection handlers to both operations together: a failed click must
  // not leave an abandoned response wait rejecting when the context closes.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(interpret|turns)$/.test(
          new URL(r.url()).pathname,
        ),
      { timeout: 120000 },
    ),
    button.click(),
  ]);
  return response;
}

export type LanguageHistoryEvidence = {
  requestId: string;
  renderedIds: string[];
  attemptedWrites: string[];
};

/** Provider-free read-back of the actual Previous result interaction.
 * Host reservation counts must be compared separately by the live runner. */
export async function verifyLanguageHistory(
  page: Page,
  expectedRequestId: string,
  expectedIds: string[],
): Promise<LanguageHistoryEvidence> {
  const attemptedWrites: string[] = [];
  const guard = async (route: Route) => {
    const request = route.request();
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      attemptedWrites.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  };
  await page.route("**/*", guard);
  try {
    const active = page
      .locator("[data-native-north-result]")
      .filter({ visible: true });
    await expect(active).toHaveCount(1);
    await expect(active).not.toHaveAttribute(
      "data-request-id",
      expectedRequestId,
    );
    const previous = page.getByRole("button", {
      name: "Previous result",
      exact: true,
    });
    await expect(previous).toBeVisible();
    await previous.click();

    return await readLanguageHistoryResult(
      page,
      expectedRequestId,
      expectedIds,
      attemptedWrites,
    );
  } finally {
    await page.unroute("**/*", guard);
  }
}

/** Explicitly select an existing owned result, never replay a completed turn.
 * Unique visible question text is required; exact request/records read-back
 * rejects an ambiguous or wrong selection. History inspection is GET-only. */
export async function selectLanguageHistory(
  page: Page,
  expectedRequestId: string,
  expectedMessage: string,
  expectedIds: string[],
): Promise<LanguageHistoryEvidence> {
  const attemptedWrites: string[] = [];
  const guard = async (route: Route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) {
      attemptedWrites.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  };
  await page.route("**/*", guard);
  try {
    await page.getByRole("button", { name: "History", exact: true }).click();
    const choice = page
      .getByRole("region", { name: "Previous North results", exact: true })
      .getByRole("button", { name: expectedMessage, exact: true });
    await expect(choice).toHaveCount(1);
    await choice.click();
    return await readLanguageHistoryResult(
      page,
      expectedRequestId,
      expectedIds,
      attemptedWrites,
    );
  } finally {
    await page.unroute("**/*", guard);
  }
}

async function readLanguageHistoryResult(
  page: Page,
  expectedRequestId: string,
  expectedIds: string[],
  attemptedWrites: string[],
): Promise<LanguageHistoryEvidence> {
  const active = page
    .locator("[data-native-north-result]")
    .filter({ visible: true });
  const restored = page.locator(
    `[data-native-north-result][data-request-id="${expectedRequestId}"]`,
  );
  await expect(restored).toBeVisible();
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute("data-request-id", expectedRequestId);
  const records = restored.locator("[data-records-result]");
  await expect(records).toBeVisible();
  // Responsive presentations can expose the same identity through both table
  // and card links. Compare exact visible record identities, not link count.
  const purchases = records
    .locator('a[href^="/vault/"]')
    .filter({ visible: true });
  const more = records.getByRole("button", {
    name: /^Show more purchases \(/,
  });
  while (await more.isVisible()) {
    const before = await purchases.count();
    await more.click();
    await expect(purchases).not.toHaveCount(before);
  }
  const readIds = () =>
    purchases.evaluateAll((links) =>
      [
        ...new Set(
          links.map((link) =>
            link.getAttribute("href")!.slice("/vault/".length),
          ),
        ),
      ].sort(),
    );
  await expect.poll(readIds).toEqual([...expectedIds].sort());
  const renderedIds = await readIds();
  const requestId = await restored.getAttribute("data-request-id");
  expect(requestId).toBe(expectedRequestId);
  expect(renderedIds).toEqual([...expectedIds].sort());
  expect(attemptedWrites).toEqual([]);
  return { requestId: requestId!, renderedIds, attemptedWrites };
}
