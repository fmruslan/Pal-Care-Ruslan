import { test, expect } from "@playwright/test";
import {
  guardRecordsCampaign,
  exerciseRecordsScenario,
} from "../../scripts/north-full-browser";
import {
  assessRecordsCase,
  type NorthRecordsProof,
} from "../../scripts/north-full-evaluation";
import { northFullRecordsDrafts } from "../fixtures/north-full-records-drafts";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { turnSchema, type CareTurn } from "../../src/lib/careos/contracts";
import { answerSemanticRecordsTurn } from "../../src/lib/careos/records/semantic-service";
import { randomUUID } from "node:crypto";
import { productGuideAnswer } from "../../src/lib/careos/product-guide";

// Harness self-checks only. Transport/model proposals are injected, no owner or
// provider access is present, and zero cases can qualify for the genuine ledger.
const noProof: NorthRecordsProof = {
  requestId: "00000000-0000-4000-8000-000000000999",
  startedAt: 0,
  policyId: "c29c6d4d-24dd-471d-8d98-c51772dc64cd",
  model: "gpt-6.1-sol",
  reasoning: "medium",
  attempts: [],
  terminalConfirmed: false,
  newUnknown: false,
  newProviderBlock: false,
};
test.describe.configure({ timeout: 60000 });

test("injected semantic orchestration renders a fresh missing-receipt search without stale Kitchen context and retains natural subsets", async ({
  page,
  context,
}, info) => {
  const guard = await guardRecordsCampaign(context, info.project.use.baseURL!);
  const history: CareTurn[] = [];
  const contexts: { contextScope: string; previousQuery: unknown }[] = [];
  const searches = [northFullRecordsDrafts[1], northFullRecordsDrafts[2]];
  const subset = {
    ...northFullRecordsDrafts[2],
    message: "Within those purchases, retain only the audio category please.",
    expectedQuery: {
      ...northFullRecordsDrafts[2].expectedQuery,
      categories: ["Audio" as const],
    },
    expectedIds: ["00000000-0000-4000-8000-000000000203"],
    expectedRecordValues: { "00000000-0000-4000-8000-000000000203": 6900 },
    expectedExcluded: 0,
  };
  const scenarios = [...searches, subset];
  await page.route(
    "**/api/careos/records/conversations/*/turns",
    async (route) => {
      const input = turnSchema.parse(route.request().postDataJSON());
      const c = scenarios.find((c) => c.message === input.message)!;
      expect(c).toBeDefined();
      const answer = await answerSemanticRecordsTurn({
        input,
        history,
        load: async () => demoData,
        now: () => new Date("2026-11-03T12:00:00Z"),
        interpret: async (raw) => {
          const payload = JSON.parse(raw);
          contexts.push({
            contextScope: payload.contextScope,
            previousQuery: payload.previousQuery,
          });
          const {
            version: _v,
            referenceDate: _r,
            timezone: _t,
            ...fields
          } = c.expectedQuery;
          void _v;
          void _r;
          void _t;
          // Mimic the observed stale-filter error when old context is exposed on
          // the fresh question. The corrected server omits it, not the scorer.
          return {
            outcome: "query",
            ...fields,
            categories:
              c === searches[1]
                ? (payload.previousQuery?.categories ?? [])
                : fields.categories,
          };
        },
      });
      const turn: CareTurn = {
        requestId: input.requestId,
        message: input.message,
        answer,
      };
      history.push(turn);
      await route.fulfill({ status: 200, json: turn });
    },
  );
  await page.goto("/dashboard");
  // Only shared launchers remain outside the panel. Keep the actual question
  // transport/UUID/financial guards below; no page submit survives.
  await expect(
    page.getByRole("button", { name: "Ask North Star", exact: true }),
  ).toHaveCount(0);
  for (const c of scenarios) {
    const result = await exerciseRecordsScenario(page, c, "turns");
    const score = assessRecordsCase(
      c,
      result.turn,
      {
        ...result.observation,
        applicationErrors: [],
        forbiddenRequests: guard.forbiddenRequests,
      },
      noProof,
    );
    expect(score.genuineEvidence).toBe(false);
    expect(
      score.checks
        .filter((c) => c.dimension !== "provider")
        .every((c) => c.pass),
    ).toBe(true);
  }
  expect(contexts.slice(0, 2)).toEqual([
    { contextScope: "fresh", previousQuery: null },
    { contextScope: "fresh", previousQuery: null },
  ]);
  expect(contexts[2]).toMatchObject({
    contextScope: "followup",
    previousQuery: { categories: [], origin: "sample", receipt: "missing" },
  });
  expect(history).toHaveLength(3);
  expect(history[0].answer.recordsResult?.records.map((r) => r.id)).toEqual([
    "00000000-0000-4000-8000-000000000202",
  ]);
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  await dialog.getByRole("button", { name: "History", exact: true }).click();
  await dialog
    .getByRole("region", { name: "Previous North results", exact: true })
    .getByRole("button", { name: history[0].message, exact: true })
    .click();
  await expect(dialog.locator("article[data-request-id]")).toHaveAttribute(
    "data-request-id",
    history[0].requestId,
  );
  await expect(
    page.locator(
      `[data-request-id="${history[0].requestId}"] [data-records-result]`,
    ),
  ).toBeVisible();
  await guard.dispose();
});

test("injected current-interface guide renders real navigation and distinct sources without native execution or replay", async ({
  page,
  context,
}, info) => {
  const guard = await guardRecordsCampaign(context, info.project.use.baseURL!);
  const requests: string[] = [];
  // Fixture mode still uses its existing records admission hint, not the live
  // model-first router. Generic guidance routing is covered separately by the
  // isolated subscription/563-cap application journey, never by this mock.
  const message =
    "How do I browse my saved purchases and receipts in Pal Care?";
  const steps = [
    "Start with Care for saved dates and next steps.",
    "Open Purchases & Docs, then Documents to find the original receipt.",
    "Open Insights for personal charts, grids and evidence.",
  ];
  await page.route(
    "**/api/careos/records/conversations/*/turns",
    async (route) => {
      const input = turnSchema.parse(route.request().postDataJSON());
      requests.push(input.requestId);
      await route.fulfill({
        status: 200,
        json: {
          requestId: input.requestId,
          message: input.message,
          answer: {
            mode: "live",
            questionScope: "general",
            context: null,
            revision: input.revision,
            ...productGuideAnswer({
              text: "Care → Purchases & Docs → Insights: start with saved evidence, then explore your own purchases.",
              steps,
              features: ["overview", "library", "insights"],
            }),
          },
        },
      });
    },
  );
  await page.goto("/dashboard");
  const result = await exerciseRecordsScenario(
    page,
    { ...northFullRecordsDrafts[0], message },
    "turns",
  );
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  const article = dialog.locator(`[data-request-id="${result.requestId}"]`);
  for (const step of steps)
    await expect(article.getByText(step, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  // This marker identifies the latest chat answer, not a native SDK action.
  await expect(page.locator("[data-native-north-result]")).toHaveAttribute(
    "data-request-id",
    result.requestId,
  );
  await expect(page.getByTestId("customer-studio")).toHaveCount(0);
  expect(result.turn.answer.customerPresentation).toBeUndefined();
  expect(result.turn.answer.recordsPresentation).toBeUndefined();
  await expect(article.locator("[data-records-result]")).toHaveCount(0);
  await article.getByText("Sources (3)", { exact: true }).click();
  await expect(
    article.getByText(
      "Pal Care interface guide · not purchase or manufacturer evidence",
      { exact: true },
    ),
  ).toHaveCount(3);
  await article
    .getByRole("link", { name: "Open Purchases & Docs", exact: true })
    .click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your products",
  );
  expect(requests).toEqual([result.requestId]);
  expect(guard.forbiddenRequests).toEqual([]);
  await guard.dispose();
});

test("campaign guard records identity before forwarding and fails closed when journaling rejects dispatch", async ({
  page,
  context,
}, info) => {
  const order: string[] = [];
  let deny = false;
  const input = {
    requestId: randomUUID(),
    twinId: null,
    revision: 0,
    message: "A draft semantic question",
  };
  const conversationId = randomUUID();
  const guard = await guardRecordsCampaign(
    context,
    info.project.use.baseURL!,
    async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/interpret")) {
        order.push("forward");
        await route.fulfill({ status: 200, json: { injected: true } });
      } else await route.continue();
    },
    async (submitted, conversation, target) => {
      expect(submitted).toEqual(input);
      expect(conversation).toBe(conversationId);
      expect(target).toBe("interpret");
      order.push("journal");
      if (deny) throw new Error("injected_journal_failure");
    },
  );
  await page.goto("/dashboard");
  const submit = () =>
    page.evaluate(
      async ({ input, conversationId }) => {
        try {
          return (
            await fetch(
              `/api/careos/records/conversations/${conversationId}/interpret`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
              },
            )
          ).status;
        } catch {
          return "blocked";
        }
      },
      { input, conversationId },
    );
  expect(await submit()).toBe(200);
  expect(order).toEqual(["journal", "forward"]);
  deny = true;
  expect(await submit()).toBe("blocked");
  expect(order).toEqual(["journal", "forward", "journal"]);
  expect(guard.forbiddenRequests).toEqual([
    "POST records-dispatch-denied-before-forwarding",
  ]);
  await guard.dispose();
});

test("browser evaluator inspects actual records and totals without promoting injected output to genuine evidence", async ({
  page,
  context,
}, info) => {
  const guard = await guardRecordsCampaign(context, info.project.use.baseURL!);
  const applicationErrors: string[] = [];
  page.on("pageerror", () =>
    applicationErrors.push("browser_application_error"),
  );
  await page.goto("/dashboard");
  for (const c of [
    northFullRecordsDrafts[0],
    northFullRecordsDrafts[18],
    northFullRecordsDrafts[34],
  ]) {
    await page.route(
      "**/api/careos/records/conversations/*/turns",
      async (route) => {
        const input = turnSchema.parse(route.request().postDataJSON());
        const {
          version: _v,
          referenceDate: _d,
          timezone: _z,
          ...fields
        } = c.expectedQuery;
        void _v;
        void _d;
        void _z;
        const answer = {
          ...recordsAnswer(
            querySavedRecords(demoData, c.expectedQuery),
            input.revision,
          ),
          mode: "live",
          recordsInterpretation: {
            version: "north-records-intent-v1",
            proposal: { outcome: "query", ...fields },
          },
        };
        await route.fulfill({
          status: 200,
          json: { requestId: input.requestId, message: input.message, answer },
        });
      },
    );
    const result = await exerciseRecordsScenario(page, c, "turns");
    const score = assessRecordsCase(
      c,
      result.turn,
      {
        ...result.observation,
        applicationErrors,
        forbiddenRequests: guard.forbiddenRequests,
      },
      noProof,
    );
    expect(score.genuineEvidence).toBe(false);
    expect(score.pass).toBe(false);
    expect(
      score.checks
        .filter((check) => check.dimension !== "provider")
        .every((check) => check.pass),
    ).toBe(true);
    await page.unroute("**/api/careos/records/conversations/*/turns");
  }
  await guard.dispose();
});

test("browser evaluator catches an injected wrong monetary value and blocks financial transport before forwarding", async ({
  page,
  context,
}, info) => {
  const guard = await guardRecordsCampaign(context, info.project.use.baseURL!);
  const c = northFullRecordsDrafts[18];
  await page.route(
    "**/api/careos/records/conversations/*/turns",
    async (route) => {
      const input = turnSchema.parse(route.request().postDataJSON());
      const result = querySavedRecords(demoData, c.expectedQuery);
      result.totals[0].amountMinor = 1;
      await route.fulfill({
        status: 200,
        json: {
          requestId: input.requestId,
          message: input.message,
          answer: recordsAnswer(result, 0),
        },
      });
    },
  );
  await page.goto("/dashboard");
  const result = await exerciseRecordsScenario(page, c, "turns");
  const score = assessRecordsCase(
    c,
    result.turn,
    { ...result.observation, applicationErrors: [], forbiddenRequests: [] },
    noProof,
  );
  expect(score).toMatchObject({
    genuineEvidence: false,
    pass: false,
    materialFailure: true,
  });
  expect(
    score.checks.find((check) => check.dimension === "arithmetic")?.pass,
  ).toBe(false);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("/api/checkout/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(guard.forbiddenRequests).toEqual(["POST /api/checkout/orders"]);
  await guard.dispose();
});
