import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessRecordsCase,
  correlateRecordsAttempts,
  type NorthRecordsObservation,
} from "../../scripts/north-full-evaluation";
import { northFullRecordsDrafts } from "../fixtures/north-full-records-drafts";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import type { CareTurn } from "../../src/lib/careos/contracts";

// Entirely injected scorer self-checks. They never write a real journal, grant
// authority, invoke a provider/browser or increment the genuine campaign.
const policyId = "c29c6d4d-24dd-471d-8d98-c51772dc64cd",
  requestId = randomUUID();
const key = `customer:${requestId}:north_records_intent_v1`;
const policy = {
  id: policyId,
  approvedAt: 1,
  provider: "chatgpt-subscription",
  model: "gpt-6.1-sol",
  reasoning: "medium",
  origin: "https://greatbison.tail9e8802.ts.net:8444",
  scopes: ["customer", "customer-studio"],
  requestLimit: 300,
  concurrency: 4,
  requestsPerMinute: 30,
  maxRetries: 1,
  creditsDisabledConfirmed: true,
  providerPermissionConfirmed: true,
  historicalJournalHash: "a".repeat(64),
};
const reservation = { at: 100, kind: "reserve", subject: key };
const completed = {
  at: 200,
  kind: "completed",
  subject: key,
  observation: {
    httpStatus: 200,
    requestId: "known-provider-request",
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cachedTokens: 0,
      cacheWriteTokens: null,
      reasoningTokens: 10,
    },
  },
};
function proof(events: unknown[] = [reservation, completed]) {
  return correlateRecordsAttempts({ policy, events }, requestId, 99, policyId);
}
const c = northFullRecordsDrafts[0];
function turn(scenario = c): CareTurn {
  const query = scenario.expectedQuery;
  const {
    version: _version,
    referenceDate: _date,
    timezone: _zone,
    ...fields
  } = query;
  void _version;
  void _date;
  void _zone;
  return {
    requestId,
    message: scenario.message,
    answer: {
      ...recordsAnswer(querySavedRecords(demoData, query), 0),
      mode: "live",
      recordsInterpretation: {
        version: "north-records-intent-v1",
        proposal: { outcome: "query", ...fields },
      },
    },
  };
}
function observed(scenario = c): NorthRecordsObservation {
  return {
    submittedMessage: scenario.message,
    renderedPurchaseIds: [...scenario.expectedIds],
    renderedPurchaseHrefs: scenario.expectedIds.map((id) => `/vault/${id}`),
    renderedRecordText: scenario.expectedIds.map(
      (id) =>
        `Sample purchase ${scenario.expectedRecordValues[id] === null ? "No saved purchase price · unpriced or reference item" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(scenario.expectedRecordValues[id]! / 100)}`,
    ),
    renderedAmountTexts: [],
    scopeText:
      "All available saved purchases checked · Fictional sample preview",
    outputFormat: "cards",
    applicationErrors: [],
    forbiddenRequests: [],
  };
}

describe("new campaign terminal proof and independent browser scorer self-checks", () => {
  it("matches the application's case-insensitive AND search semantics without allowing extra narrowing tokens", () => {
    const scenario = northFullRecordsDrafts[6],
      value = turn(scenario);
    value.answer.recordsResult!.query.search = " pi RASPBERRY ";
    value.answer.recordsInterpretation!.proposal.search = " pi RASPBERRY ";
    expect(
      assessRecordsCase(scenario, value, observed(scenario), proof()).pass,
    ).toBe(true);
    value.answer.recordsResult!.query.search = "raspberry pi 5";
    expect(
      assessRecordsCase(scenario, value, observed(scenario), proof()),
    ).toMatchObject({ pass: false, materialFailure: true });
  });
  it("requires a matching actual reservation and one terminal completion, preserving usage/correlation", () => {
    expect(proof()).toMatchObject({
      terminalConfirmed: true,
      model: "gpt-6.1-sol",
      newUnknown: false,
    });
    expect(proof().attempts[0]).toMatchObject({
      providerRequestId: "known-provider-request",
      usage: { totalTokens: 120 },
    });
    expect(proof([reservation]).terminalConfirmed).toBe(false);
    expect(proof([completed]).terminalConfirmed).toBe(false);
    expect(proof([reservation, reservation, completed]).terminalConfirmed).toBe(
      false,
    );
    expect(proof([reservation, completed, completed]).terminalConfirmed).toBe(
      false,
    );
    expect(
      proof([
        reservation,
        completed,
        { ...completed, subject: `${key}:retry-1` },
      ]).terminalConfirmed,
    ).toBe(false);
  });
  it("retains the charged historical unknown and stops on a new unknown rather than replaying it", () => {
    const old = { at: 1, kind: "unknown", subject: "historical-attempt" };
    expect(proof([old, reservation, completed])).toMatchObject({
      terminalConfirmed: true,
      newUnknown: false,
    });
    expect(
      proof([reservation, { at: 200, kind: "unknown", subject: key }]),
    ).toMatchObject({ terminalConfirmed: false, newUnknown: true });
    expect(
      proof([
        reservation,
        completed,
        { at: 201, kind: "provider-block", subject: "provider" },
      ]).newProviderBlock,
    ).toBe(true);
  });
  it("correlates only the already permitted, separately reserved safe retry", () => {
    const failed = {
      at: 101,
      kind: "failed",
      subject: key,
      observation: { httpStatus: 503 },
    };
    const retry = { at: 102, kind: "reserve", subject: `${key}:retry-1` };
    const finish = { ...completed, subject: `${key}:retry-1` };
    expect(proof([reservation, failed, retry, finish]).terminalConfirmed).toBe(
      true,
    );
    expect(proof([retry, finish]).terminalConfirmed).toBe(false);
    expect(
      proof([
        reservation,
        { ...failed, observation: { httpStatus: 429 } },
        retry,
        finish,
      ]).terminalConfirmed,
    ).toBe(false);
  });
  it("never accepts a live badge/HTTP status, mismatched case input or old policy as genuine evidence", () => {
    expect(
      assessRecordsCase(c, turn(), observed(), proof([])).genuineEvidence,
    ).toBe(false);
    expect(
      assessRecordsCase(
        c,
        { ...turn(), message: "another question" },
        observed(),
        proof(),
      ).genuineEvidence,
    ).toBe(false);
    expect(
      assessRecordsCase(
        c,
        { ...turn(), requestId: randomUUID() },
        observed(),
        proof(),
      ).genuineEvidence,
    ).toBe(false);
    expect(
      assessRecordsCase(
        c,
        turn(),
        observed(),
        correlateRecordsAttempts(
          { policy, events: [reservation, completed] },
          requestId,
          99,
          randomUUID(),
        ),
      ).genuineEvidence,
    ).toBe(false);
  });
  it("independently checks actual rendered IDs/links, not just a correct saved JSON result", () => {
    expect(assessRecordsCase(c, turn(), observed(), proof()).pass).toBe(true);
    const failed = assessRecordsCase(
      c,
      turn(),
      { ...observed(), renderedPurchaseIds: [], renderedPurchaseHrefs: [] },
      proof(),
    );
    expect(failed.pass).toBe(false);
    expect(failed.genuineEvidence).toBe(true); // A confirmed genuine answer may fail UI acceptance.
    expect(
      failed.checks.find((c) => c.dimension === "rendering" && !c.pass),
    ).toBeTruthy();
  });
  it("flags wrong monetary evidence and forbidden actions without rewriting expectations", () => {
    const value = turn();
    value.answer.recordsResult!.totals[0].amountMinor = 1;
    const score = assessRecordsCase(
      c,
      value,
      { ...observed(), forbiddenRequests: ["POST /api/checkout/orders"] },
      proof(),
    );
    expect(score).toMatchObject({ pass: false, materialFailure: true });
    expect(c.expectedSampleMinor).toBe(21800);
  });
});
