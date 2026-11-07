import { describe, expect, it } from "vitest";
import { CareError } from "../../src/lib/careos/contracts";
import {
  CAMPAIGN_EXECUTION_LIMIT,
  CAMPAIGN_HISTORICAL_LIMIT,
  QUESTION_MAX_STAGES,
  campaignBudget,
  assertCampaignQuestionOpen,
  assertCampaignStage,
  assertCampaignQuestionClose,
  type CampaignExecutionEvent,
} from "../../src/lib/careos/campaign-execution";

const allocationId = "feb8831c-702b-476e-91e3-d0034ceb645d";
const request = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const conversation = "33333333-3333-4333-8333-333333333333";
const otherConversation = "44444444-4444-4444-8444-444444444444";
const question = `customer:${request}:question:${conversation}`;
const first = `customer:${request}:north_conversation_v1`;
const second = `customer:${request}:careos_care`;
function event(
  kind: string,
  subject: string,
  observation?: { httpStatus?: number },
): CampaignExecutionEvent {
  return { kind, subject, allocationId, at: 1000, observation };
}
function historical(count = 63): CampaignExecutionEvent[] {
  return Array.from({ length: count }, (_, n) => [
    event("reserve", `historical-${n}`),
    event(
      n === 0 ? "unknown" : n === 1 ? "failed" : "completed",
      `historical-${n}`,
    ),
  ]).flat();
}
function opened(count = 63): CampaignExecutionEvent[] {
  const events = historical(count);
  events.push(
    event(
      "question-open",
      assertCampaignQuestionOpen(events, request, conversation),
    ),
  );
  return events;
}
function reserve(events: CampaignExecutionEvent[], key = first) {
  assertCampaignStage(events, key);
  events.push(event("reserve", key));
}
function complete(events: CampaignExecutionEvent[], key = first) {
  events.push(event("completed", key, { httpStatus: 200 }));
}
function close(events: CampaignExecutionEvent[]) {
  events.push(
    event(
      "question-close",
      assertCampaignQuestionClose(events, request, conversation),
    ),
  );
}
function expectDenied(work: () => unknown, code?: string, status = 403) {
  expect(work).toThrow(CareError);
  try {
    work();
  } catch (error) {
    expect(error).toMatchObject({
      status,
      ...(code ? { code: `careos_owner_campaign_${code}` } : {}),
    });
  }
}

describe("pure fixed-campaign budget and whole-question ledger admission", () => {
  it("pins source limits and counts every historical attempt, never outcomes as refunds", () => {
    expect(CAMPAIGN_EXECUTION_LIMIT).toBe(150);
    expect(CAMPAIGN_HISTORICAL_LIMIT).toBe(300);
    expect(QUESTION_MAX_STAGES).toBe(2);
    expect(campaignBudget(historical())).toEqual({
      historicalLimit: 300,
      executionLimit: 150,
      used: 63,
      remaining: 87,
      held: 0,
      availableForNewQuestion: 87,
    });
  });

  it.each([63, 148, 149, 150, 151])(
    "reports actual %i charges without decrementing or hiding historical over-cap usage",
    (used) => {
      const events = historical(used);
      expect(campaignBudget(events)).toMatchObject({
        used,
        remaining: Math.max(0, 150 - used),
        held: 0,
        availableForNewQuestion: Math.max(0, 150 - used),
      });
      if (used <= 148)
        expect(assertCampaignQuestionOpen(events, request, conversation)).toBe(
          question,
        );
      else
        expectDenied(
          () => assertCampaignQuestionOpen(events, request, conversation),
          "quota_exhausted",
          429,
        );
    },
  );

  it("ignores other allocations and leaves all 274 standing charges/one unknown untouched", () => {
    const standing = historical(274).map((e) => ({
      ...e,
      allocationId: undefined,
    }));
    const unrelated = [
      { ...event("question-close", "malformed"), allocationId: other },
      { ...event("reserve", first), allocationId: other },
    ];
    const events = [...standing, ...unrelated, ...historical()];
    expect(campaignBudget(events)).toEqual(campaignBudget(historical()));
    expect(standing.filter((e) => e.kind === "reserve")).toHaveLength(274);
    expect(standing.filter((e) => e.kind === "unknown")).toHaveLength(1);
  });

  it("counts arbitrary and duplicate pre-marker reservation subjects as charges", () => {
    const events = [event("reserve", "legacy"), event("reserve", "legacy")];
    expect(campaignBudget(events).used).toBe(2);
  });

  it("does not reinterpret legacy chronology or missing outcomes as permission to discard charges", () => {
    const events = [
      { ...event("reserve", "legacy-unknown"), at: 2000 },
      event("unknown", "legacy-unknown"),
      { ...event("reserve", "legacy-unsettled"), at: 500 },
    ];
    expect(campaignBudget(events)).toMatchObject({ used: 2, remaining: 148 });
  });

  it("reconstructs a durable two-slot hold on restart without charging a call", () => {
    const events = opened();
    expect(campaignBudget(JSON.parse(JSON.stringify(events)))).toEqual({
      historicalLimit: 300,
      executionLimit: 150,
      used: 63,
      remaining: 87,
      held: 2,
      availableForNewQuestion: 85,
      activeQuestion: {
        requestId: request,
        conversationId: conversation,
        subject: question,
        openedAt: 1000,
        reservedStages: 0,
        completedStages: 0,
      },
    });
    expectDenied(
      () => assertCampaignQuestionOpen(events, other, otherConversation),
      "question_busy",
      429,
    );
  });

  it("models serialized admission: the next locked snapshot rejects a competing question", () => {
    const events = historical(148);
    const accepted = assertCampaignQuestionOpen(events, request, conversation);
    events.push(event("question-open", accepted));
    expectDenied(
      () => assertCampaignQuestionOpen(events, other, conversation),
      "question_busy",
      429,
    );
    expect(campaignBudget(events)).toMatchObject({
      used: 148,
      held: 2,
      availableForNewQuestion: 0,
    });
  });

  it("converts holds into actual charges through both stages up to exactly 150", () => {
    const events = opened(148);
    reserve(events);
    expect(campaignBudget(events)).toMatchObject({
      used: 149,
      remaining: 1,
      held: 1,
      availableForNewQuestion: 0,
    });
    complete(events);
    reserve(events, second);
    expect(campaignBudget(events)).toMatchObject({
      used: 150,
      remaining: 0,
      held: 0,
      availableForNewQuestion: 0,
    });
    complete(events, second);
    close(events);
    expect(campaignBudget(events)).toEqual({
      historicalLimit: 300,
      executionLimit: 150,
      used: 150,
      remaining: 0,
      held: 0,
      availableForNewQuestion: 0,
    });
  });

  it("releases only the unstarted second slot after one successful stage, intentionally leaving 149 unusable", () => {
    const events = opened(148);
    reserve(events);
    complete(events);
    close(events);
    expect(campaignBudget(events)).toMatchObject({
      used: 149,
      remaining: 1,
      held: 0,
      availableForNewQuestion: 1,
    });
    expectDenied(
      () => assertCampaignQuestionOpen(events, other, conversation),
      "quota_exhausted",
      429,
    );
  });

  it("allows known-undispatched zero-attempt close without reopening the same UUID", () => {
    const events = opened();
    close(events);
    expect(campaignBudget(events)).toEqual(campaignBudget(historical()));
    expectDenied(
      () => assertCampaignQuestionOpen(events, request, otherConversation),
      "request_reused",
    );
    expect(assertCampaignQuestionOpen(events, other, conversation)).toBe(
      `customer:${other}:question:${conversation}`,
    );
  });

  it.each(["unsettled", "unknown", "failed", "missing-http", "wrong-http"])(
    "never releases or advances an active %s attempt, including after restart",
    (outcome) => {
      const events = opened();
      reserve(events);
      if (outcome !== "unsettled")
        events.push(
          event(
            outcome === "missing-http" || outcome === "wrong-http"
              ? "completed"
              : outcome,
            first,
            outcome === "missing-http"
              ? undefined
              : { httpStatus: outcome === "wrong-http" ? 201 : 200 },
          ),
        );
      const restarted = JSON.parse(JSON.stringify(events));
      expect(campaignBudget(restarted)).toMatchObject({ used: 64, held: 1 });
      expectDenied(
        () => assertCampaignQuestionClose(restarted, request, conversation),
        "question_unsettled",
      );
      expectDenied(
        () => assertCampaignStage(restarted, second),
        "stage_denied",
      );
      expectDenied(
        () => assertCampaignQuestionOpen(restarted, other, conversation),
        "question_busy",
        429,
      );
    },
  );

  it("keeps a successful first stage's hold across a crash instead of inferring close", () => {
    const events = opened();
    reserve(events);
    complete(events);
    const restarted = JSON.parse(JSON.stringify(events));
    expect(campaignBudget(restarted)).toMatchObject({ used: 64, held: 1 });
    expect(assertCampaignStage(restarted, second)).toBeUndefined();
    expectDenied(
      () => assertCampaignQuestionOpen(restarted, other, conversation),
      "question_busy",
      429,
    );
  });

  it.each([first, second])(
    "denies direct %s without a question hold",
    (key) => {
      expectDenied(
        () => assertCampaignStage(historical(), key),
        "question_required",
      );
    },
  );

  it.each([
    second,
    `${first}:retry-1`,
    `${second}:retry-1`,
    `customer:${other}:north_conversation_v1`,
    `customer:${request}:careos_evidence`,
    `customer:${request}:north_records_v1`,
    `customer-studio:${request}:north_conversation_v1`,
  ])("rejects wrong first-stage identity/order/name/retry: %s", (key) => {
    expectDenied(() => assertCampaignStage(opened(), key), "stage_denied");
  });

  it("rejects duplicate/third stages and every dispatch after close", () => {
    const events = opened();
    reserve(events);
    complete(events);
    expectDenied(() => assertCampaignStage(events, first), "stage_denied");
    reserve(events, second);
    complete(events, second);
    expectDenied(() => assertCampaignStage(events, second), "stage_denied");
    expectDenied(() => assertCampaignStage(events, first), "stage_denied");
    close(events);
    expectDenied(() => assertCampaignStage(events, first), "question_required");
    expectDenied(
      () => assertCampaignQuestionClose(events, request, conversation),
      "question_mismatch",
    );
  });

  it("requires the exact conversation and request to close", () => {
    const events = opened();
    expectDenied(
      () => assertCampaignQuestionClose(events, request, otherConversation),
      "question_mismatch",
    );
    expectDenied(
      () => assertCampaignQuestionClose(events, other, conversation),
      "question_mismatch",
    );
  });

  it("rejects UUID reuse from a legacy reservation even in a different conversation", () => {
    const events = [
      event("reserve", first),
      event("completed", first, { httpStatus: 200 }),
    ];
    expectDenied(
      () => assertCampaignQuestionOpen(events, request, otherConversation),
      "request_reused",
    );
  });

  it("prevents reusing a historical standalone Studio request without granting that stage new admission", () => {
    const key = `customer-studio:${request}:legacy_plan`;
    const events = [event("reserve", key), event("unknown", key)];
    expect(campaignBudget(events).used).toBe(1);
    expectDenied(
      () => assertCampaignQuestionOpen(events, request, conversation),
      "request_reused",
    );
    expectDenied(() => assertCampaignStage(opened(), key), "stage_denied");
  });

  it.each(["unsettled", "failed", "unknown"])(
    "keeps both second-stage charges when its outcome is %s and refuses close",
    (outcome) => {
      const events = opened(148);
      reserve(events);
      complete(events);
      reserve(events, second);
      if (outcome !== "unsettled") events.push(event(outcome, second));
      expect(campaignBudget(events)).toMatchObject({
        used: 150,
        remaining: 0,
        held: 0,
      });
      expectDenied(
        () => assertCampaignQuestionClose(events, request, conversation),
        "question_unsettled",
      );
    },
  );

  it("admits at most 87 additional calls across many whole questions, with holds and charges always within 150", () => {
    const events = historical();
    // One single-stage question followed by 43 two-stage questions uses 87.
    for (let n = 0; n < 44; n++) {
      const id = `${(n + 10).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
      const marker = assertCampaignQuestionOpen(events, id, conversation);
      events.push(event("question-open", marker));
      for (const name of n === 0
        ? ["north_conversation_v1"]
        : ["north_conversation_v1", "careos_care"]) {
        const key = `customer:${id}:${name}`;
        reserve(events, key);
        complete(events, key);
        const budget = campaignBudget(events);
        expect(budget.used + budget.held).toBeLessThanOrEqual(150);
      }
      events.push(
        event(
          "question-close",
          assertCampaignQuestionClose(events, id, conversation),
        ),
      );
    }
    expect(campaignBudget(events)).toEqual({
      historicalLimit: 300,
      executionLimit: 150,
      used: 150,
      remaining: 0,
      held: 0,
      availableForNewQuestion: 0,
    });
    expectDenied(
      () => assertCampaignQuestionOpen(events, other, conversation),
      "quota_exhausted",
      429,
    );
  });

  it.each([
    "bad",
    "",
    "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    `${request}:extra`,
  ])("rejects invalid/noncanonical identities: %s", (value) => {
    expectDenied(
      () => assertCampaignQuestionOpen([], value, conversation),
      "invalid_identity",
    );
    expectDenied(
      () => assertCampaignQuestionClose([], request, value),
      "invalid_identity",
    );
  });

  it.each([
    "malformed",
    `customer:${request}:question`,
    `customer:${request}:other:${conversation}`,
    `${question}:extra`,
    `customer:bad:question:${conversation}`,
    `customer:${request}:question:bad`,
  ])("fails closed on malformed stored marker %s", (value) => {
    expectDenied(() =>
      campaignBudget([...historical(), event("question-open", value)]),
    );
  });

  it.each([
    "close-without-open",
    "duplicate-open",
    "parallel-open",
    "duplicate-close",
    "wrong-close",
    "reused-open",
    "stage-two-first",
    "duplicate-stage",
    "third-stage",
    "reserve-after-close",
    "unsettled-close",
    "unknown-close",
    "failed-close",
    "outcome-without-reserve",
    "duplicate-outcome",
    "backdated",
    "invalid-time",
    "over-cap-open",
  ])("rejects unbalanced/corrupted persisted ledger: %s", (which) => {
    const events = which === "close-without-open" ? historical() : opened();
    if (which === "close-without-open")
      events.push(event("question-close", question));
    if (which === "duplicate-open")
      events.push(event("question-open", question));
    if (which === "parallel-open")
      events.push(
        event("question-open", `customer:${other}:question:${conversation}`),
      );
    if (which === "wrong-close")
      events.push(
        event(
          "question-close",
          `customer:${request}:question:${otherConversation}`,
        ),
      );
    if (
      ["duplicate-close", "reused-open", "reserve-after-close"].includes(which)
    ) {
      close(events);
      events.push(
        event(
          which === "duplicate-close"
            ? "question-close"
            : which === "reused-open"
              ? "question-open"
              : "reserve",
          which === "reserve-after-close" ? first : question,
        ),
      );
    }
    if (which === "stage-two-first") events.push(event("reserve", second));
    if (
      [
        "duplicate-stage",
        "third-stage",
        "unsettled-close",
        "unknown-close",
        "failed-close",
        "duplicate-outcome",
      ].includes(which)
    ) {
      reserve(events);
      if (which !== "unsettled-close")
        events.push(
          event(
            which === "unknown-close"
              ? "unknown"
              : which === "failed-close"
                ? "failed"
                : "completed",
            first,
            { httpStatus: 200 },
          ),
        );
      if (which === "third-stage") {
        reserve(events, second);
        complete(events, second);
      }
      events.push(
        event(
          which === "duplicate-outcome"
            ? "completed"
            : which.endsWith("close")
              ? "question-close"
              : "reserve",
          which.endsWith("close") ? question : first,
          { httpStatus: 200 },
        ),
      );
    }
    if (which === "outcome-without-reserve") complete(events);
    if (which === "backdated")
      events.push({ ...event("reserve", first), at: 999 });
    if (which === "invalid-time")
      events.push({ ...event("reserve", first), at: Number.NaN });
    if (which === "over-cap-open")
      events.splice(
        0,
        events.length,
        ...historical(149),
        event("question-open", question),
      );
    expectDenied(() => campaignBudget(events));
  });

  it("never mutates supplied events or observations on any successful/denied path", () => {
    const events = opened();
    reserve(events);
    complete(events);
    const before = JSON.stringify(events);
    for (const e of events) {
      if (e.observation) Object.freeze(e.observation);
      Object.freeze(e);
    }
    Object.freeze(events);
    campaignBudget(events);
    assertCampaignStage(events, second);
    assertCampaignQuestionClose(events, request, conversation);
    expectDenied(
      () => assertCampaignQuestionOpen(events, other, conversation),
      "question_busy",
      429,
    );
    expectDenied(() => assertCampaignStage(events, first), "stage_denied");
    expect(JSON.stringify(events)).toBe(before);
  });
});
