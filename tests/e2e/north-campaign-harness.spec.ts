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
import { turnSchema } from "../../src/lib/careos/contracts";
import { randomUUID } from "node:crypto";

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
