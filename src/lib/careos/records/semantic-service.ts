import type { DemoData } from "../../../db/schema";
import type { CareAnswer, CareTurn, TurnInput } from "../contracts";
import {
  answerRecordsTurn,
  previousRecordsResult,
  querySavedRecords,
  recordsAnswer,
} from "./service";
import {
  recordsQueryContinuation,
  recordsRequestAllowed,
  resolveRecordsQuery,
} from "./query";
import {
  interpretedRecordsQuery,
  recordsInterpretationSchema,
  RECORDS_INTERPRETATION_VERSION,
} from "./interpretation";
import { emptyRecordsQuery } from "./contracts";

/** The caller must enforce private inference permission and durable accounting.
 * The model only proposes bounded filters; application arithmetic/IDs are final. */
export async function answerSemanticRecordsTurn(options: {
  input: TurnInput;
  history: CareTurn[];
  load: () => Promise<DemoData & { source?: "fixtures" | "database" }>;
  interpret: (payload: string) => Promise<unknown>;
  now?: () => Date;
}): Promise<CareAnswer> {
  const now = (options.now ?? (() => new Date()))();
  const referenceDate = now.toISOString().slice(0, 10);
  const previous = previousRecordsResult(options.history);
  const continuation = recordsQueryContinuation(options.input.message);
  const deterministic = resolveRecordsQuery(
    options.input.message,
    referenceDate,
    previous?.query,
  );
  if (
    (deterministic && "query" in deterministic) ||
    (continuation && !previous) ||
    /^(?:new topic|start a new topic)[.!]?$/i.test(options.input.message.trim())
  )
    return answerRecordsTurn(options);
  if (!recordsRequestAllowed(options.input.message))
    return {
      outcome: "unsupported",
      mode: "deterministic",
      revision: options.input.revision,
      questionScope: "library",
      context: null,
      text: "That request is outside read-only saved-purchase analysis. No model, financial action or permission change was requested.",
      steps: [],
      sources: [],
      actions: [],
    };
  // Establish a readable saved library before spending inference capacity. Give
  // bounded, validated catalogue hints, never IDs/amounts or a trusted transcript.
  const data = await options.load();
  const library = querySavedRecords(
    data,
    emptyRecordsQuery(referenceDate),
    now.toISOString(),
  );
  const catalogue = [
    ...new Map(
      library.records.map((record) => {
        const hint = {
          name: record.name,
          model: record.model,
          category: record.category,
        };
        return [JSON.stringify(hint), hint] as const;
      }),
    ).values(),
  ];
  const proposed = await options.interpret(
    JSON.stringify({
      question: options.input.message,
      referenceDate,
      timezone: "UTC",
      contextScope: continuation ? "followup" : "fresh",
      previousQuery: continuation ? (previous?.query ?? null) : null,
      categories: ["Audio", "Computing", "Kitchen"],
      catalogueHints: catalogue.slice(0, 12),
      catalogueHintsComplete:
        catalogue.length <= 12 && library.coverage.complete,
      scope: "fixed fictional customer's saved records only",
    }),
  );
  const recordsInterpretation: NonNullable<
    CareAnswer["recordsInterpretation"]
  > = {
    version: RECORDS_INTERPRETATION_VERSION,
    proposal: recordsInterpretationSchema.parse(proposed),
  };
  const query = interpretedRecordsQuery(
    recordsInterpretation.proposal,
    referenceDate,
  );
  if (!query)
    return {
      outcome: "unsupported",
      mode: "live",
      revision: options.input.revision,
      questionScope: "library",
      context: null,
      text: "North could not safely map that question to a supported saved-record query. Please give a product, category or exact date range. No filters or facts were invented.",
      steps: [],
      sources: [],
      actions: [],
      recordsInterpretation,
    };
  const result = querySavedRecords(data, query, now.toISOString());
  return {
    ...recordsAnswer(result, options.input.revision),
    mode: "live",
    recordsInterpretation,
    steps: [
      "AI interpreted the query; saved-record identities, links and amounts were resolved and calculated by the application.",
      ...recordsAnswer(result, options.input.revision).steps,
    ],
  };
}
