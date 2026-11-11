import { z } from "zod";
import {
  expect,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";
import {
  turnSchema,
  type CareTurn,
  type TurnInput,
} from "../src/lib/careos/contracts";
import { recordsResultSchema } from "../src/lib/careos/records/contracts";
import type {
  NorthRecordsCase,
  NorthRecordsObservation,
} from "./north-full-evaluation";

const recordTurn =
  /^\/api\/careos\/records\/conversations\/[a-f0-9-]{36}\/(turns|interpret)$/;
/** Fail closed before a browser request is forwarded. This grants no server
 * authority and never enables a transport, pairs a browser or copies cookies. */
export async function guardRecordsCampaign(
  context: BrowserContext,
  origin: string,
  forward?: (route: Route) => Promise<void>,
  beforeRecordsDispatch?: (
    input: TurnInput,
    conversationId: string,
    target: string,
  ) => Promise<void>,
) {
  const forbiddenRequests: string[] = [];
  const handler = async (route: Route) => {
    const request = route.request(),
      url = new URL(request.url());
    const read = ["GET", "HEAD"].includes(request.method());
    const consequential =
      /^\/api\/(checkout|operator|guardian|paypal|payments)(?:\/|$)/.test(
        url.pathname,
      );
    const allowedWrite =
      request.method() === "POST" &&
      (recordTurn.test(url.pathname) ||
        /^\/api\/careos\/(?:records\/)?conversations$/.test(url.pathname));
    if (url.origin !== origin || consequential || (!read && !allowedWrite)) {
      forbiddenRequests.push(
        `${request.method()} ${url.origin === origin ? url.pathname : "external-origin"}`,
      );
      return route.abort("blockedbyclient");
    }
    const match = recordTurn.exec(url.pathname);
    if (!read && match && beforeRecordsDispatch) {
      try {
        await beforeRecordsDispatch(
          turnSchema.parse(request.postDataJSON()),
          z.uuid().parse(url.pathname.split("/").at(-2)),
          match[1],
        );
      } catch {
        forbiddenRequests.push(
          "POST records-dispatch-denied-before-forwarding",
        );
        return route.abort("blockedbyclient");
      }
    }
    return forward ? forward(route) : route.continue();
  };
  await context.route("**/*", handler);
  return { forbiddenRequests, dispose: () => context.unroute("**/*", handler) };
}

/** One explicitly submitted application turn. No retry, clear, pairing or direct
 * provider invocation. Default requires the protected production interpreter;
 * the turns target is available only for labeled injected harness self-checks. */
export async function exerciseRecordsScenario(
  page: Page,
  c: NorthRecordsCase,
  expectedTarget: "interpret" | "turns" = "interpret",
) {
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  if (!(await dialog.isVisible()))
    await page
      .getByRole("button", { name: "Explore with North Star", exact: true })
      .click();
  const composer = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await composer.fill(c.message);
  await expect(
    dialog.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeEnabled();
  const responsePromise = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      recordTurn.test(new URL(r.url()).pathname),
    { timeout: 60000 },
  );
  const startedAt = Date.now();
  await dialog
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const response = await responsePromise;
  const input = turnSchema.parse(response.request().postDataJSON());
  if (!response.ok())
    throw new Error(`north_application_http_${response.status()}`);
  if (!new URL(response.url()).pathname.endsWith(`/${expectedTarget}`))
    throw new Error("north_unexpected_records_transport");
  const turn = (await response.json()) as CareTurn;
  if (z.uuid().parse(turn.requestId) !== input.requestId)
    throw new Error("north_application_request_identity_mismatch");
  const article = dialog.locator(`[data-request-id="${input.requestId}"]`);
  await expect(article).toBeVisible();
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  const parsed = recordsResultSchema.safeParse(turn.answer.recordsResult);
  const root = article.locator("[data-records-result]");
  let renderedPurchaseIds: string[] = [],
    renderedPurchaseHrefs: string[] = [],
    renderedRecordText: string[] = [],
    renderedAmountTexts: string[] = [],
    scopeText = "";
  let outputFormat: NorthRecordsObservation["outputFormat"] = "none";
  if (parsed.success) {
    await expect(root).toBeVisible();
    for (let remaining = 0; remaining < 50; remaining++) {
      const more = root.getByRole("button", { name: /^Show more purchases/ });
      if (!(await more.count())) break;
      await more.click();
    }
    const table = root.getByRole("table", {
      name: "Matching saved purchases",
      exact: true,
    });
    const list = root.getByRole("list", {
      name: "Matching saved purchases",
      exact: true,
    });
    const rows = (await table.count())
      ? table.locator("tbody > tr")
      : list.locator(":scope > li");
    const observedRows = await rows.evaluateAll((elements) =>
      elements.map((element) => {
        const link =
          element.querySelector<HTMLAnchorElement>('a[href^="/vault/"]');
        return {
          href: link?.getAttribute("href") ?? "",
          text: (element as HTMLElement).innerText,
        };
      }),
    );
    renderedPurchaseHrefs = observedRows.map((r) => r.href);
    renderedPurchaseIds = renderedPurchaseHrefs.map((href) =>
      href.split("/").at(-1)!,
    );
    renderedRecordText = observedRows.map((r) => r.text);
    renderedAmountTexts = await root
      .locator(":scope > dl > div > dd:first-of-type")
      .allTextContents();
    renderedAmountTexts = renderedAmountTexts.map((text) => text.trim());
    scopeText =
      (await root.locator(":scope > details").first().textContent()) ?? "";
    outputFormat = (await table.count())
      ? "table"
      : (await list.getAttribute("class"))?.includes("list-disc")
        ? "bullets"
        : "cards";
  }
  return {
    startedAt,
    requestId: input.requestId,
    turn,
    article,
    observation: {
      submittedMessage: input.message,
      renderedPurchaseIds,
      renderedPurchaseHrefs,
      renderedRecordText,
      renderedAmountTexts,
      scopeText,
      outputFormat,
    },
  };
}
