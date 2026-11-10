import { z } from "zod";
import { standingPolicySchema } from "../src/lib/careos/standing-owner";
import { recordsInterpretationSchema } from "../src/lib/careos/records/interpretation";
import { recordsResultSchema } from "../src/lib/careos/records/contracts";
import type { CareTurn } from "../src/lib/careos/contracts";
import type { northFullRecordsDrafts } from "../tests/fixtures/north-full-records-drafts";

export type NorthRecordsCase = (typeof northFullRecordsDrafts)[number];
const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  reasoningTokens: z.number().int().nonnegative(),
});
const accountingSchema = z.object({
  policy: standingPolicySchema,
  events: z.array(
    z.object({
      at: z.number().int().nonnegative(),
      kind: z.string(),
      subject: z.string(),
      observation: z
        .object({
          httpStatus: z.number().int().optional(),
          requestId: z.string().optional(),
          usage: usageSchema.optional(),
        })
        .optional(),
    }),
  ),
});

/** Correlate actual HOST journal events, not a browser badge/status string.
 * Pure tests may inject journals to test this rule, never to count live cases. */
export function correlateRecordsAttempts(
  raw: unknown,
  requestId: string,
  startedAt: number,
  expectedPolicyId: string,
) {
  const state = accountingSchema.parse(raw);
  z.uuid().parse(requestId);
  const base = `customer:${requestId}:north_records_intent_v1`;
  const keys = [base, `${base}:retry-1`];
  const events = state.events.filter(
    (e) => keys.includes(e.subject) && e.at >= startedAt,
  );
  const reservations = events.filter((e) => e.kind === "reserve");
  const attempts = reservations.map((reservation) => {
    const finals = events.filter(
      (e) =>
        e.subject === reservation.subject &&
        ["completed", "unknown", "failed"].includes(e.kind),
    );
    const final = finals.length === 1 ? finals[0] : undefined;
    return {
      subject: reservation.subject,
      startedAt: reservation.at,
      finishedAt: final?.at ?? null,
      terminal: final?.kind ?? "unsettled",
      httpStatus: final?.observation?.httpStatus ?? null,
      providerRequestId: final?.observation?.requestId ?? null,
      usage: final?.observation?.usage ?? null,
    };
  });
  const unique = new Set(reservations.map((e) => e.subject));
  const terminalEvents = events.filter((e) =>
    ["completed", "unknown", "failed"].includes(e.kind),
  );
  const completed = attempts.filter((a) => a.terminal === "completed");
  const ordered =
    attempts.length === 1
      ? attempts[0].subject === base && attempts[0].terminal === "completed"
      : attempts.length === 2 &&
        state.policy.maxRetries === 1 &&
        attempts[0].subject === base &&
        attempts[0].terminal === "failed" &&
        attempts[0].httpStatus === 503 &&
        attempts[1].subject === keys[1] &&
        attempts[1].terminal === "completed" &&
        attempts[0].finishedAt !== null &&
        attempts[0].finishedAt <= attempts[1].startedAt;
  return {
    requestId,
    startedAt,
    policyId: state.policy.id,
    model: state.policy.model,
    reasoning: state.policy.reasoning,
    attempts,
    terminalConfirmed:
      state.policy.id === expectedPolicyId &&
      state.policy.scopes.includes("customer") &&
      ordered &&
      unique.size === reservations.length &&
      terminalEvents.length === reservations.length &&
      completed.length === 1 &&
      completed[0].httpStatus === 200 &&
      attempts.every(
        (a) => a.finishedAt !== null && a.finishedAt >= a.startedAt,
      ),
    newUnknown: state.events.some(
      (e) => e.kind === "unknown" && e.at >= startedAt,
    ),
    newProviderBlock: state.events.some(
      (e) => e.kind === "provider-block" && e.at >= startedAt,
    ),
  };
}
export type NorthRecordsProof = ReturnType<typeof correlateRecordsAttempts>;
export type NorthRecordsObservation = {
  submittedMessage: string;
  renderedPurchaseIds: string[];
  renderedPurchaseHrefs: string[];
  renderedRecordText: string[];
  renderedAmountTexts: string[];
  scopeText: string;
  outputFormat: "cards" | "bullets" | "table" | "none";
  applicationErrors: string[];
  forbiddenRequests: string[];
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const searchWords = (value: string) =>
  [
    ...new Set(
      value.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean),
    ),
  ].sort();
const usd = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );

/** Independent frozen intent/data/DOM checks. A genuine completion may fail;
 * scoring never mutates expectations, frees usage or dispatches another call. */
export function assessRecordsCase(
  c: NorthRecordsCase,
  turn: CareTurn,
  observed: NorthRecordsObservation,
  proof: NorthRecordsProof,
) {
  const checks: { dimension: string; name: string; pass: boolean }[] = [];
  const check = (dimension: string, name: string, pass: boolean) =>
    checks.push({ dimension, name, pass });
  const inputMatches =
    turn.message === c.message && observed.submittedMessage === c.message;
  const proposal = recordsInterpretationSchema.safeParse(
    turn.answer.recordsInterpretation?.proposal,
  );
  const genuineEvidence =
    proof.terminalConfirmed &&
    proof.requestId === turn.requestId &&
    inputMatches &&
    turn.answer.mode === "live" &&
    proposal.success &&
    turn.answer.recordsInterpretation?.version === "north-records-intent-v1";
  check(
    "provider",
    "correlated terminal production proposal, not HTTP/mode alone",
    genuineEvidence,
  );
  check(
    "scope",
    "exact submitted input and library-only answer",
    inputMatches &&
      turn.answer.questionScope === "library" &&
      turn.answer.context === null,
  );
  const parsed = recordsResultSchema.safeParse(turn.answer.recordsResult);
  check("schema", "application-validated saved-record result", parsed.success);
  if (parsed.success) {
    const result = parsed.data,
      query = result.query;
    for (const field of [
      "operation",
      "format",
      "from",
      "to",
      "origin",
      "receipt",
      "document",
      "price",
      "search",
      "referenceDate",
      "timezone",
    ] as const)
      check(
        "interpretation",
        `frozen ${field}`,
        field === "search"
          ? same(searchWords(query.search), searchWords(c.expectedQuery.search))
          : same(query[field], c.expectedQuery[field]),
      );
    check(
      "interpretation",
      "frozen category set",
      same(
        [...query.categories].sort(),
        [...c.expectedQuery.categories].sort(),
      ),
    );
    check(
      "accuracy",
      "exact independent saved purchase identities",
      same(result.records.map((r) => r.id).sort(), [...c.expectedIds].sort()),
    );
    const sample = result.totals.find((t) => t.origin === "sample"),
      sandbox = result.totals.find((t) => t.origin === "sandbox");
    check(
      "arithmetic",
      "literal Sample minor-unit total and denominator",
      sample?.amountMinor === c.expectedSampleMinor &&
        sample.excludedCount === c.expectedExcluded &&
        sample.pricedCount + sample.excludedCount === c.expectedIds.length,
    );
    check(
      "provenance",
      "Sample-only input never becomes Sandbox money",
      !!sandbox &&
        sandbox.amountMinor === 0 &&
        sandbox.pricedCount === 0 &&
        sandbox.excludedCount === 0 &&
        result.records.every((r) => r.origin === "sample"),
    );
    check(
      "coverage",
      "complete available saved scope, not hidden truncation",
      result.coverage.complete &&
        observed.scopeText.includes("All available saved purchases checked"),
    );
    if (c.expectedPreviousPeriod) {
      check(
        "comparison",
        "exact previous period, no fabricated records or growth",
        result.comparison?.from === c.expectedPreviousPeriod.from &&
          result.comparison.to === c.expectedPreviousPeriod.to &&
          result.comparison.records.length === 0 &&
          result.comparison.totals.every((t) => t.amountMinor === 0),
      );
    } else
      check(
        "comparison",
        "no unrequested comparison",
        result.comparison === null,
      );
    if (query.operation !== "list")
      check(
        "rendering",
        "actual displayed split monetary totals",
        observed.renderedAmountTexts[0] === usd(c.expectedSampleMinor) &&
          observed.renderedAmountTexts[1] === usd(0),
      );
  }
  check(
    "rendering",
    "actual DOM purchase set, not a claimed result",
    same([...observed.renderedPurchaseIds].sort(), [...c.expectedIds].sort()) &&
      new Set(observed.renderedPurchaseIds).size ===
        observed.renderedPurchaseIds.length,
  );
  check(
    "arithmetic",
    "actual per-purchase rendered amounts or unavailable-price labels",
    observed.renderedPurchaseIds.every((id, i) => {
      if (!Object.hasOwn(c.expectedRecordValues, id)) return false;
      const value = c.expectedRecordValues[id];
      return value === null
        ? /unavailable|reference item/i.test(
            observed.renderedRecordText[i] ?? "",
          )
        : (observed.renderedRecordText[i] ?? "").includes(usd(value));
    }),
  );
  check(
    "navigation",
    "exact Twin links for every rendered purchase",
    same(
      [...observed.renderedPurchaseHrefs].sort(),
      c.expectedIds.map((id) => `/vault/${id}`).sort(),
    ),
  );
  check(
    "rendering",
    "visible Sample provenance and requested output",
    observed.renderedRecordText.length === c.expectedIds.length &&
      observed.renderedRecordText.every((t) => t.includes("Sample")) &&
      observed.outputFormat === c.expectedQuery.format,
  );
  check(
    "safety",
    "no application error or forbidden network/action",
    observed.applicationErrors.length === 0 &&
      observed.forbiddenRequests.length === 0,
  );
  return {
    caseId: c.id,
    genuineEvidence,
    pass: checks.every((c) => c.pass),
    checks,
    materialFailure: checks.some(
      (c) =>
        !c.pass &&
        [
          "interpretation",
          "accuracy",
          "arithmetic",
          "provenance",
          "rendering",
          "navigation",
          "safety",
        ].includes(c.dimension),
    ),
    stopDispatch: proof.newUnknown || proof.newProviderBlock,
  };
}
