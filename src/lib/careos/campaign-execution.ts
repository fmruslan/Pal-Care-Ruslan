import { z } from "zod";
import { CareError } from "./contracts";

export const CAMPAIGN_EXECUTION_LIMIT = 150;
export const QUOTA_CAMPAIGN_EXECUTION_LIMIT = 163;
export const QUOTA_CAMPAIGN_EXTENSION_LIMIT = 263;
export const CAMPAIGN_HISTORICAL_LIMIT = 300;
export const QUESTION_MAX_STAGES = 2;
const allocation = "feb8831c-702b-476e-91e3-d0034ceb645d";
const stages = ["north_conversation_v1", "careos_care"] as const;

export type CampaignExecutionEvent = {
  readonly kind: string;
  readonly subject: string;
  readonly allocationId?: string;
  readonly at: number;
  readonly id?: string;
  readonly observation?: { readonly httpStatus?: number };
  readonly executionLimit?: 163 | 263;
};
type Stage = {
  key: string;
  at: number;
  outcome?: "completed" | "failed" | "unknown";
  httpStatus?: number;
};
type Question = {
  requestId: string;
  conversationId: string;
  subject: string;
  openedAt: number;
  stages: Stage[];
};
export type CampaignBudget = {
  historicalLimit: typeof CAMPAIGN_HISTORICAL_LIMIT;
  executionLimit:
    | typeof CAMPAIGN_EXECUTION_LIMIT
    | typeof QUOTA_CAMPAIGN_EXECUTION_LIMIT
    | typeof QUOTA_CAMPAIGN_EXTENSION_LIMIT;
  used: number;
  remaining: number;
  held: number;
  /** Uncharged, unheld capacity; admission also requires no active question. */
  availableForNewQuestion: number;
  activeQuestion?: {
    requestId: string;
    conversationId: string;
    subject: string;
    openedAt: number;
    reservedStages: number;
    completedStages: number;
  };
};

function deny(reason: string, status = 403): never {
  throw new CareError(`careos_owner_campaign_${reason}`, status);
}
function uuid(value: string) {
  // Ledger subjects are exact identities, not case-folded aliases.
  if (value !== value.toLowerCase() || !z.uuid().safeParse(value).success)
    deny("invalid_identity");
  return value;
}
function subject(requestId: string, conversationId: string) {
  return `customer:${uuid(requestId)}:question:${uuid(conversationId)}`;
}
function marker(value: string) {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "customer" || parts[2] !== "question")
    return deny("invalid_marker");
  return {
    requestId: uuid(parts[1]),
    conversationId: uuid(parts[3]),
    subject: value,
  };
}
function successful(stage: Stage) {
  return stage.outcome === "completed" && stage.httpStatus === 200;
}
function assertStage(question: Question | undefined, key: string) {
  if (!question) return deny("question_required");
  const index = question.stages.length;
  if (
    index >= QUESTION_MAX_STAGES ||
    key !== `customer:${question.requestId}:${stages[index]}` ||
    (index > 0 && !successful(question.stages[index - 1]))
  )
    deny("stage_denied");
}
function assertClose(question: Question | undefined, expected: string) {
  if (!question || question.subject !== expected)
    return deny("question_mismatch");
  if (!question.stages.every(successful)) deny("question_unsettled");
}

/** Pure snapshot projection. Callers MUST hold the same owner lock while
 * validating AND appending an event atomically to the owner ledger. Historical
 * reservations before the first marker remain charged without requiring holds.
 * These helpers neither authenticate callers nor grant provider authority. */
function derive(events: readonly CampaignExecutionEvent[]) {
  let used = 0;
  let executionLimit: CampaignBudget["executionLimit"] =
    CAMPAIGN_EXECUTION_LIMIT;
  let marked = false;
  let lastAt = -1;
  let active: Question | undefined;
  const requests = new Set<string>();
  for (const event of events) {
    if (event.allocationId !== allocation) continue;
    // Only the explicit additive authorization changes the projection. Legacy
    // grants and their earlier 150 ceiling remain unchanged. Authentication and
    // the authorization hash are independently checked by StandingOwner.
    if (
      event.kind === "approve-quota-campaign" &&
      event.executionLimit === QUOTA_CAMPAIGN_EXECUTION_LIMIT
    )
      executionLimit =
        executionLimit === CAMPAIGN_EXECUTION_LIMIT
          ? QUOTA_CAMPAIGN_EXECUTION_LIMIT
          : executionLimit;
    if (event.kind === "approve-quota-campaign-extension") {
      if (
        executionLimit !== QUOTA_CAMPAIGN_EXECUTION_LIMIT ||
        event.executionLimit !== QUOTA_CAMPAIGN_EXTENSION_LIMIT ||
        used !== 163 ||
        active
      )
        deny("invalid_ledger");
      executionLimit = QUOTA_CAMPAIGN_EXTENSION_LIMIT;
    }
    const isMarker = ["question-open", "question-close"].includes(event.kind);
    const isAttempt = ["reserve", "completed", "failed", "unknown"].includes(
      event.kind,
    );
    if (!isMarker && !isAttempt) continue;
    if (!marked && !isMarker) {
      // Historical integrity/eligibility belongs to the central owner resolver.
      // No new marker or chronology requirement may erase legacy charges.
      if (event.kind === "reserve") {
        used++;
        const request = /^(?:customer|customer-studio):([^:]+):/.exec(
          event.subject,
        )?.[1];
        if (request && z.uuid().safeParse(request).success)
          requests.add(request.toLowerCase());
      }
      continue;
    }
    if (!Number.isSafeInteger(event.at) || event.at < 0 || event.at < lastAt)
      deny("invalid_ledger");
    lastAt = event.at;
    if (isMarker) {
      const identity = marker(event.subject);
      marked = true;
      if (event.kind === "question-open") {
        if (
          active ||
          requests.has(identity.requestId) ||
          used + QUESTION_MAX_STAGES > executionLimit
        )
          deny("invalid_ledger");
        requests.add(identity.requestId);
        active = { ...identity, openedAt: event.at, stages: [] };
      } else {
        assertClose(active, identity.subject);
        active = undefined;
      }
      continue;
    }
    if (event.kind === "reserve") {
      // Count EVERY allocation reservation, independent of its outcome/key.
      used++;
      assertStage(active, event.subject);
      if (used > executionLimit) deny("invalid_ledger");
      active!.stages.push({ key: event.subject, at: event.at });
    } else if (marked) {
      const stage = active?.stages.find((s) => s.key === event.subject);
      if (!stage || stage.outcome || event.at < stage.at)
        deny("invalid_ledger");
      stage.outcome = event.kind as Stage["outcome"];
      stage.httpStatus = event.observation?.httpStatus;
    }
  }
  const held = active ? QUESTION_MAX_STAGES - active.stages.length : 0;
  const remaining = Math.max(0, executionLimit - used);
  const budget: CampaignBudget = {
    historicalLimit: CAMPAIGN_HISTORICAL_LIMIT,
    executionLimit,
    used,
    remaining,
    held,
    availableForNewQuestion: Math.max(0, remaining - held),
    ...(active
      ? {
          activeQuestion: {
            requestId: active.requestId,
            conversationId: active.conversationId,
            subject: active.subject,
            openedAt: active.openedAt,
            reservedStages: active.stages.length,
            completedStages: active.stages.filter(successful).length,
          },
        }
      : {}),
  };
  return { budget, active, requests };
}

export function campaignBudget(
  events: readonly CampaignExecutionEvent[],
): CampaignBudget {
  return derive(events).budget;
}

export function assertCampaignQuestionOpen(
  events: readonly CampaignExecutionEvent[],
  requestId: string,
  conversationId: string,
): string {
  const expected = subject(requestId, conversationId);
  const { budget, active, requests } = derive(events);
  if (requests.has(requestId)) deny("request_reused");
  if (active) deny("question_busy", 429);
  if (budget.availableForNewQuestion < QUESTION_MAX_STAGES)
    deny("quota_exhausted", 429);
  return expected;
}

export function assertCampaignStage(
  events: readonly CampaignExecutionEvent[],
  key: string,
): void {
  const { active, budget } = derive(events);
  assertStage(active, key);
  if (budget.remaining < 1 || budget.held < 1) deny("quota_exhausted", 429);
}

export function assertCampaignQuestionClose(
  events: readonly CampaignExecutionEvent[],
  requestId: string,
  conversationId: string,
): string {
  const expected = subject(requestId, conversationId);
  assertClose(derive(events).active, expected);
  return expected;
}
