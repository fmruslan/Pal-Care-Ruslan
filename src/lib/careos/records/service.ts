import { createHash } from "node:crypto";
import type { DemoData } from "../../../db/schema";
import { customerDataset } from "../../intelligence/customer-model";
import { money } from "../../demo/presentation";
import type { CareAnswer, CareTurn, TurnInput } from "../contracts";
import { CareError } from "../contracts";
import {
  RECORDS_LIMIT,
  recordsQuerySchema,
  recordsResultSchema,
  type RecordsQuery,
  type RecordsResult,
  type RecordTotal,
  type SavedRecord,
} from "./contracts";
import {
  previousPeriod,
  resolveRecordsQuery,
  normalizeRecordsLanguage,
  recordsRequestAllowed,
} from "./query";
import { emptyRecordsQuery } from "./contracts";
import { ownedFollowupHistory } from "./followup";
import { prohibitsChartExecution } from "../interaction-limits";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function recordTotals(records: SavedRecord[]): RecordTotal[] {
  return (["sample", "sandbox"] as const).map((origin) => {
    const scoped = records.filter((r) => r.origin === origin);
    const priced = scoped.filter((r) => r.amountMinor !== null);
    const amountMinor = priced.reduce((sum, r) => sum + r.amountMinor!, 0);
    if (!Number.isSafeInteger(amountMinor))
      throw new CareError("careos_records_amount_overflow");
    return {
      origin,
      amountMinor,
      pricedCount: priced.length,
      excludedCount: scoped.length - priced.length,
    };
  });
}
export function matchingRecords(records: SavedRecord[], query: RecordsQuery) {
  const words = query.search.toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter(
    (r) =>
      (!query.from || r.purchasedOn >= query.from) &&
      (!query.to || r.purchasedOn <= query.to) &&
      (!query.categories.length ||
        query.categories.includes(
          r.category as RecordsQuery["categories"][number],
        )) &&
      (query.origin === "all" || r.origin === query.origin) &&
      (query.receipt === "any" ||
        (query.receipt === "present") === !!r.receiptId) &&
      (query.document === "any" ||
        (query.document === "present") === !!r.documents.length) &&
      (query.price === "any" ||
        (query.price === "missing") === (r.amountMinor === null)) &&
      words.every((word) =>
        `${r.name} ${r.model} ${r.category}`.toLowerCase().includes(word),
      ),
  );
}

/** No model, provider, financial, guardian or recall dependency. */
export function querySavedRecords(
  data: DemoData & { source?: "fixtures" | "database" },
  query: RecordsQuery,
  observedAt = new Date().toISOString(),
  comparisonOverride?: { from: string; to: string },
): RecordsResult {
  query = recordsQuerySchema.parse(query);
  const projected = customerDataset(
    data,
    [],
    null,
    { items: [], unavailable: [] },
    [],
    RECORDS_LIMIT,
  );
  const available = projected.purchases;
  const records = available.map((r): SavedRecord => ({
    id: r.id,
    name: r.name,
    model: r.model,
    category: r.category,
    purchasedOn: r.purchasedOn,
    origin: r.origin,
    amountMinor: r.amountMinor,
    receiptId: r.receiptHref?.split("/").at(-1) ?? null,
    documents: r.documentLinks
      .slice(0, 100)
      .map((d) => ({ id: d.href.split("/").at(-1)!, title: d.title })),
  }));
  const selected = matchingRecords(records, query);
  const excludedInvalidCount = Math.max(
    0,
    new Set(data.twins.map((r) => r.id)).size -
      available.length -
      Math.max(0, data.twins.length - RECORDS_LIMIT),
  );
  const complete =
    data.twins.length <= RECORDS_LIMIT &&
    !projected.unavailable.some(
      (v) => v === "Purchase scope" || v === "Purchase evidence",
    );
  if (comparisonOverride) {
    recordsQuerySchema.parse({
      ...query,
      from: comparisonOverride.from,
      to: comparisonOverride.to,
    });
    if (query.operation !== "compare")
      throw new CareError("careos_records_invalid_comparison");
  }
  const comparisonRange =
    comparisonOverride ??
    (query.operation === "compare" && query.from && query.to
      ? previousPeriod(query.from, query.to)
      : null);
  const prior = comparisonRange
    ? matchingRecords(records, { ...query, ...comparisonRange })
    : null;
  const snapshotId = hash({ records, source: data.source ?? "fixtures" });
  return recordsResultSchema.parse({
    version: 1,
    snapshotId,
    queryFingerprint: hash({
      snapshotId,
      from: query.from,
      to: query.to,
      categories: [...query.categories].sort(),
      origin: query.origin,
      receipt: query.receipt,
      document: query.document,
      price: query.price,
      search: query.search,
      ...(comparisonOverride ? { comparison: comparisonOverride } : {}),
    }),
    observedAt,
    query,
    coverage: {
      source: data.source ?? "fixtures",
      complete,
      availableCount: available.length,
      limit: RECORDS_LIMIT,
      excludedInvalidCount,
    },
    records: selected,
    totals: recordTotals(selected),
    groups: [...new Set(selected.map((r) => r.category))]
      .sort()
      .map((label) => {
        const group = selected.filter((r) => r.category === label);
        return {
          label,
          totals: recordTotals(group),
          recordIds: group.map((r) => r.id),
        };
      }),
    comparison:
      comparisonRange && prior
        ? { ...comparisonRange, records: prior, totals: recordTotals(prior) }
        : null,
  });
}

export function recordsAnswer(
  result: RecordsResult,
  revision: number,
  explain = false,
  presentation: "standard" | "concise" | "scope-first" = "standard",
): CareAnswer {
  const { query, coverage, records } = result;
  const period =
    query.from || query.to
      ? `${query.from ?? "earliest available"} through ${query.to ?? query.referenceDate} (inclusive; ${query.timezone})`
      : "all saved dates";
  const answer: CareAnswer = {
    outcome: "answered",
    mode: "deterministic",
    revision,
    questionScope: "library",
    context: null,
    text: explain
      ? `${query.categories.length ? `The current selection is ${query.categories.join(" + ")} only. ` : ""}${
          result.comparison
            ? `This compares recorded amounts for ${period} with ${result.comparison.from} through ${result.comparison.to} (inclusive; ${query.timezone}). Example purchases and Verified Sandbox are separate; unpriced/reference records are excluded from amounts.`
            : !records.length
              ? coverage.complete
                ? "No saved purchases match those filters."
                : "No matches in the available saved records; other records may be unavailable."
              : query.price === "missing"
                ? `${records
                    .slice(0, 3)
                    .map((r) => r.name)
                    .join(
                      ", ",
                    )}${records.length > 3 ? ` and ${records.length - 3} more` : ""} ${records.length === 1 ? "has" : "have"} no recorded purchase price. The price is unknown, not zero or free, so ${records.length === 1 ? "it is" : "they are"} left out of spending totals.`
                : `These are the ${records.length} saved purchase${records.length === 1 ? "" : "s"} matching your selection (${period}). Example purchase recorded amounts total ${money(result.totals.find((t) => t.origin === "sample")!.amountMinor)}; Verified Sandbox recorded amounts total ${money(result.totals.find((t) => t.origin === "sandbox")!.amountMinor)}. Purchases without a recorded price are left out of those amounts.`
        }${coverage.complete ? "" : " Only part of the saved library is available; these are not complete-library totals."}`
      : `${records.length} matching saved purchase${records.length === 1 ? "" : "s"} · ${period}.${coverage.complete ? "" : " Partial saved-library evidence; global totals are not established."}`,
    steps: explain
      ? [
          ...(result.comparison
            ? result.totals.map((total) =>
                recordedValueComparison(
                  total,
                  result.comparison!.totals.find(
                    (previous) => previous.origin === total.origin,
                  )!,
                  result,
                ),
              )
            : []),
          "Open a purchase below for its receipt, documents and history.",
        ]
      : [
          ...(query.categories.length
            ? [
                `Categories: ${query.categories.join(" + ")}${query.categories.length === 2 && query.categories.includes("Audio") && query.categories.includes("Computing") ? " (Electronics)" : ""}.`,
              ]
            : []),
          ...(query.receipt !== "any"
            ? [
                `Receipt filter: ${query.receipt}; policies and care cards do not count as receipts.`,
              ]
            : []),
          ...(query.origin !== "all"
            ? [
                `Evidence filter: ${query.origin === "sample" ? "Example purchase" : "Verified Sandbox"}.`,
              ]
            : []),
          "Example purchase and Verified Sandbox values are shown separately. Purchases with no saved price are counted but left out of the amounts.",
          ...(query.document !== "any"
            ? [
                `Documents: ${query.document}. Each link opens a document for that exact purchase.`,
              ]
            : []),
          ...observedPatterns(result),
        ],
    sources: [],
    actions: [],
    recordsResult: result,
  };
  if (presentation === "standard") return answer;
  const scope = `Showing: ${[
    query.categories.length
      ? `${query.categories.join(" + ")} only`
      : "all saved purchases",
    query.origin === "all"
      ? "Example purchases and Verified Sandbox"
      : query.origin === "sample"
        ? "Example purchases only"
        : "Verified Sandbox only",
    period,
    ...(query.receipt === "any" ? [] : [`receipts: ${query.receipt}`]),
    ...(query.document === "any" ? [] : [`saved documents: ${query.document}`]),
    ...(query.price === "any" ? [] : [`recorded price: ${query.price}`]),
    ...(query.search ? [`search: ${JSON.stringify(query.search)}`] : []),
  ].join("; ")}.`;
  const comparison = result.comparison
    ? ` Compared with ${result.comparison.from} through ${result.comparison.to} (inclusive; ${query.timezone}).`
    : "";
  if (presentation === "scope-first")
    return { ...answer, text: `${scope}${comparison} ${answer.text}` };
  return {
    ...answer,
    text: `${scope}${comparison} ${records.length} matching saved purchase${records.length === 1 ? "" : "s"}. Purchases without a saved price are excluded from amounts; unknown is not zero.${coverage.complete ? "" : " Some saved purchases are unavailable, so these totals may be incomplete."}${result.comparison ? " This compares saved amounts, not your complete account history or the reason for a change." : ""}${result.comparison?.totals.some((total) => total.amountMinor === 0) ? " A percentage change cannot be calculated from a zero starting amount." : ""}`,
    steps: result.totals.map((total) =>
      result.comparison
        ? recordedValueComparison(
            total,
            result.comparison.totals.find(
              (previous) => previous.origin === total.origin,
            )!,
            result,
            true,
          )
        : `${total.origin === "sample" ? "Example purchase" : "Verified Sandbox"}: ${money(total.amountMinor)} (${total.pricedCount} priced, ${total.excludedCount} excluded).`,
    ),
  };
}

function recordedValueComparison(
  total: RecordTotal,
  previous: RecordTotal,
  result: RecordsResult,
  concise = false,
) {
  const name =
    total.origin === "sample" ? "Example purchase" : "Verified Sandbox";
  const delta = total.amountMinor - previous.amountMinor;
  const first = `${result.query.from ?? "earliest available"} through ${result.query.to ?? result.query.referenceDate}`;
  const second = `${result.comparison!.from} through ${result.comparison!.to}`;
  const conclusion =
    delta === 0
      ? `Both periods have equal recorded ${name} value.`
      : `${delta > 0 ? first : second} had ${money(Math.abs(delta))} more recorded ${name} value than ${delta > 0 ? second : first}.`;
  if (concise)
    return `${name}: ${first}: ${money(total.amountMinor)} (${total.pricedCount} priced, ${total.excludedCount} excluded); ${second}: ${money(previous.amountMinor)} (${previous.pricedCount} priced, ${previous.excludedCount} excluded). ${conclusion}`;
  return `${name} recorded-value comparison: ${first}: ${money(total.amountMinor)} (${total.pricedCount} priced, ${total.excludedCount} excluded); ${second}: ${money(previous.amountMinor)} (${previous.pricedCount} priced, ${previous.excludedCount} excluded). ${conclusion} ${previous.amountMinor === 0 ? "Percentage growth from a zero prior value is not established." : "A recorded-value difference does not establish a cause or a complete account trend."}`;
}

/** Observed saved-data descriptions, never a model's causal/personal-spending claim. */
export function observedPatterns(result: RecordsResult): string[] {
  if (
    result.query.operation !== "breakdown" &&
    result.query.operation !== "compare"
  )
    return [];
  const observations: string[] = [];
  for (const total of result.totals) {
    const name =
      total.origin === "sample" ? "Example purchase" : "Verified Sandbox";
    if (total.pricedCount) {
      const ranked = result.groups
        .map((group) => ({
          label: group.label,
          total: group.totals.find((t) => t.origin === total.origin)!,
        }))
        .filter((group) => group.total.pricedCount > 0)
        .sort(
          (a, b) =>
            b.total.amountMinor - a.total.amountMinor ||
            a.label.localeCompare(b.label),
        );
      const maximum = ranked[0];
      const leaders = ranked
        .filter(
          (group) => group.total.amountMinor === maximum.total.amountMinor,
        )
        .map((group) => group.label);
      observations.push(
        `${name} saved evidence: ${leaders.join(" + ")} ${leaders.length === 1 ? "has" : "tie for"} the largest recorded category value (${money(maximum.total.amountMinor)}${leaders.length > 1 ? " each" : ""}), within ${money(total.amountMinor)} across ${total.pricedCount} priced purchases; ${total.excludedCount} unpriced/reference excluded. This describes available records, not a reason for spending.`,
      );
    }
    if (result.comparison) {
      const previous = result.comparison.totals.find(
        (t) => t.origin === total.origin,
      )!;
      observations.push(recordedValueComparison(total, previous, result));
    }
  }
  return observations;
}

/** Follow-ups use only server-owned turns. Client text/context never supplies a result. */
export async function answerRecordsTurn(options: {
  input: TurnInput;
  history: CareTurn[];
  load: () => Promise<DemoData & { source?: "fixtures" | "database" }>;
  now?: () => Date;
}): Promise<CareAnswer> {
  const history = ownedFollowupHistory(
    options.history,
    options.input.followupRequestId,
  );
  const now = (options.now ?? (() => new Date()))();
  const presentation = prohibitsChartExecution(options.input.message)
    ? { recordsPresentation: { action: "inspect" as const } }
    : {};
  if (
    recordsRequestAllowed(options.input.message) &&
    /\bwarrant(?:y|ies)\b/.test(normalizeRecordsLanguage(options.input.message))
  ) {
    const result = querySavedRecords(
      await options.load(),
      emptyRecordsQuery(now.toISOString().slice(0, 10)),
    );
    return warrantyRecordsAnswer(result, options.input.revision);
  }
  if (
    /^(?:new topic|start a new topic)[.!]?$/i.test(options.input.message.trim())
  )
    return {
      outcome: "answered",
      mode: "deterministic",
      revision: options.input.revision,
      questionScope: "general",
      context: null,
      text: "New topic started. Earlier results and your selected product are kept; follow-up filters will not carry into the new topic.",
      steps: [],
      sources: [],
      actions: [],
      recordsTopic: "reset",
    };
  const prior = previousRecordsResult(history);
  const resolution = resolveRecordsQuery(
    options.input.message,
    now.toISOString().slice(0, 10),
    prior?.query,
  );
  if (!resolution || "clarification" in resolution)
    return {
      outcome: "unsupported",
      mode: "deterministic",
      revision: options.input.revision,
      questionScope: "library",
      context: null,
      text:
        resolution?.clarification ??
        "That saved-record query is not supported yet. Try ‘Show my purchases’, ‘Find purchases with receipts’, or an exact date range.",
      steps: [],
      sources: [],
      actions: [],
    };
  if (resolution.reuse && prior) {
    // No fresh retrieval or model call for a format-only change. Keep original
    // snapshot/query reference date and explain that it is a saved result.
    const result = {
      ...prior,
      query: { ...resolution.query, referenceDate: prior.query.referenceDate },
      comparison:
        resolution.query.operation === "compare" ? prior.comparison : null,
    };
    const answer = recordsAnswer(result, options.input.revision);
    return {
      ...answer,
      text: `Same saved result. ${answer.text}`,
      ...presentation,
    };
  }
  return {
    ...recordsAnswer(
      querySavedRecords(
        await options.load(),
        resolution.query,
        now.toISOString(),
      ),
      options.input.revision,
    ),
    ...presentation,
  };
}

export function warrantyRecordsAnswer(
  result: RecordsResult,
  revision: number,
): CareAnswer {
  const answer = recordsAnswer(result, revision);
  return {
    ...answer,
    text: "No verified warranty-expiration dates are recorded in the available purchase data. I can't identify expiring warranties from purchase dates or return deadlines. These are relevant saved products and documents, not a list of confirmed expiring warranties.",
    steps: [
      "Warranty duration, start date and exclusions must be verified from the applicable terms before calculating an expiration. A saved policy is not proof of warranty coverage.",
      ...answer.steps,
    ],
  };
}

export function previousRecordsResult(history: CareTurn[]) {
  const reset = history.findLastIndex((t) => t.answer.recordsTopic === "reset");
  const previous = [...history.slice(reset + 1)]
    .reverse()
    .map((t) => t.answer.recordsResult)
    .find(Boolean);
  const parsed = previous ? recordsResultSchema.safeParse(previous) : null;
  return parsed?.success ? parsed.data : undefined;
}
