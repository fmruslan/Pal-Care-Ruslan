import type { CareAnswer } from "../src/lib/careos/contracts";
import {
  recordsResultSchema,
  type SavedRecord,
} from "../src/lib/careos/records/contracts";
import type { Goal } from "../tests/fixtures/north-language-library";

const sameIds = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
/** Independent oracle: no querySavedRecords, model output or UI-computed totals. */
export function expectedLanguageRecords(snapshot: SavedRecord[], goal: Goal) {
  const f = goal.filter ?? {};
  return snapshot.filter(
    (r) =>
      (!f.category || r.category === f.category) &&
      (!f.origin || r.origin === f.origin) &&
      (!f.receipt ||
        (f.receipt === "present" ? !!r.receiptId : !r.receiptId)) &&
      (!f.price || r.amountMinor === null) &&
      (!f.search ||
        `${r.name} ${r.model}`.toLowerCase().includes(f.search.toLowerCase())),
  );
}
export type NativeReadback = {
  state: {
    selectedPageId?: string;
    pages?: {
      id: string;
      widgets?: Record<
        string,
        {
          type?: string;
          dataMapping?: Record<string, { id: string; aggregation?: string }[]>;
        }
      >;
      filter?: {
        page?: {
          field: { id: string };
          model: {
            operator: string;
            value?: string;
            conditions?: { operator: string; value: string }[];
          };
        }[];
      };
      selection?: { type: string; id: string };
      widgetLayout?: Record<
        string,
        { xTrack: number; yTrack: number; xSpan: number; ySpan: number }
      >;
    }[];
  };
  recordIds: string[];
  nativeDisplaysVerified: boolean;
};
export type LanguageObservation = {
  text: string;
  renderedIds: string[];
  linksResolve: boolean;
  nativeReadback: NativeReadback | null;
  applicationErrors: string[];
  forbiddenRequests: string[];
};
export function assessLanguageAnswer(
  goal: Goal,
  snapshot: SavedRecord[],
  answer: CareAnswer,
  observed: LanguageObservation,
) {
  const checks: { name: string; pass: boolean }[] = [];
  const check = (name: string, pass: boolean) => checks.push({ name, pass });
  check(
    "No forbidden browser dispatch",
    observed.forbiddenRequests.length === 0,
  );
  check("No application exception", observed.applicationErrors.length === 0);
  check("Saved links resolve", observed.linksResolve);
  check("Answer was rendered", observed.text.includes(answer.text));
  const expected = expectedLanguageRecords(snapshot, goal);
  if (goal.filter && !goal.action) {
    const parsed = recordsResultSchema.safeParse(answer.recordsResult);
    check("Supported saved-record result", parsed.success);
    if (parsed.success) {
      const result = parsed.data;
      check(
        "Exact independent record IDs",
        sameIds(
          result.records.map((r) => r.id),
          expected.map((r) => r.id),
        ),
      );
      check(
        "Exact rendered record IDs",
        sameIds(
          observed.renderedIds,
          expected.map((r) => r.id),
        ),
      );
      check(
        "Actual database evidence, complete",
        result.coverage.source === "database" && result.coverage.complete,
      );
      check(
        "Original record facts unchanged",
        result.records.every((r) => {
          const original = snapshot.find((s) => s.id === r.id);
          return (
            !!original &&
            [
              "name",
              "model",
              "purchasedOn",
              "origin",
              "amountMinor",
              "receiptId",
            ].every(
              (k) =>
                r[k as keyof SavedRecord] === original[k as keyof SavedRecord],
            )
          );
        }),
      );
      for (const origin of ["sample", "sandbox"] as const) {
        const records = expected.filter((r) => r.origin === origin),
          total = result.totals.find((t) => t.origin === origin);
        check(
          `${origin} exact minor-unit total and exclusions`,
          !!total &&
            total.amountMinor ===
              records.reduce((n, r) => n + (r.amountMinor ?? 0), 0) &&
            total.excludedCount ===
              records.filter((r) => r.amountMinor === null).length &&
            total.pricedCount ===
              records.filter((r) => r.amountMinor !== null).length,
        );
      }
      if (goal.format)
        check("Requested output format", result.query.format === goal.format);
      if (goal.operation)
        check(
          "Requested operation",
          result.query.operation === goal.operation ||
            (goal.operation === "list" && result.query.operation === "total"),
        );
      if (goal.format === "chart") {
        const native = observed.nativeReadback;
        const page = native?.state.pages?.find((p) => p.id === "purchases");
        const chart = page?.widgets?.["extra-recorded-value-chart"];
        const filter = page?.filter?.page?.find(
          (f) => f.field.id === "purchases.id",
        )?.model;
        const filteredIds =
          filter?.operator === "OR"
            ? (filter.conditions
                ?.filter((c) => c.operator === "equals")
                .map((c) => c.value) ?? [])
            : [];
        const expectedIds = expected.map((r) => r.id);
        check(
          "Native SDK/data postconditions, not success text",
          !!native &&
            native.nativeDisplaysVerified &&
            native.state.selectedPageId === "purchases" &&
            sameIds(
              native.recordIds,
              expected.map((r) => r.id),
            ) &&
            Object.values(
              native.state.pages?.find((p) => p.id === "purchases")?.widgets ??
                {},
            ).some((w) => w.type === "bar-chart-grouped"),
        );
        check(
          "Exact native ID filter and selection",
          !!page &&
            (expectedIds.length
              ? sameIds(filteredIds, expectedIds)
              : filter?.value === "no-matching-purchase") &&
            page.selection?.type === "widget" &&
            page.selection.id === "extra-recorded-value-chart",
        );
        check(
          "Native provenance mappings and sums",
          chart?.type === "bar-chart-grouped" &&
            chart.dataMapping?.categoryKey?.length === 1 &&
            chart.dataMapping.categoryKey[0].id === "purchases.category" &&
            ["sample", "sandbox"].every(
              (origin) =>
                chart.dataMapping?.valueKey?.some(
                  (m) =>
                    m.id === `purchases.${origin}Usd` &&
                    m.aggregation === "sum",
                ) &&
                page?.widgets?.[`extra-${origin}-value`]?.type === "value" &&
                page.widgets[`extra-${origin}-value`].dataMapping?.value?.some(
                  (m) =>
                    m.id === `purchases.${origin}Usd` &&
                    m.aggregation === "sum",
                ),
            ),
        );
        check(
          "Native widgets have valid layout",
          [
            "extra-recorded-value-chart",
            "extra-sample-value",
            "extra-sandbox-value",
          ].every((id) => {
            const p = page?.widgetLayout?.[id];
            return (
              !!p &&
              p.xTrack >= 0 &&
              p.yTrack >= 0 &&
              p.xSpan > 0 &&
              p.xTrack + p.xSpan <= 24 &&
              p.ySpan > 0
            );
          }),
        );
      }
    }
  }
  if (goal.action === "receipt") {
    check(
      "Exact dated product context",
      !!answer.context?.twinId &&
        expected.some((r) => r.id === answer.context!.twinId),
    );
    check(
      "Exact saved receipt, not substituted",
      expected.some(
        (r) =>
          !!r.receiptId &&
          [...answer.actions, ...answer.sources].some((a) =>
            a.href.includes(r.receiptId!),
          ),
      ),
    );
  }
  if (goal.action === "manual")
    check(
      "Missing manufacturer manual stays honest",
      answer.outcome === "missing" &&
        /no manufacturer manual|no.*manual.*available|manual.*not available/i.test(
          answer.text,
        ),
    );
  if (goal.action === "care") {
    check(
      "Exact Raspberry Pi 5 context",
      /raspberry pi/i.test(answer.context?.name ?? "") &&
        /5/.test(answer.context?.model ?? ""),
    );
    check(
      "Approved source 501 or honest insufficiency",
      answer.outcome === "missing" ||
        answer.sources.some(
          (s) =>
            s.id === "00000000-0000-4000-8000-000000000501" &&
            !!s.excerpt &&
            answer.steps.every((step) => s.excerpt!.includes(step)),
        ),
    );
  }
  if (goal.action === "clarify")
    check(
      "Clarification rather than invented action",
      answer.conversationPlan?.task === "clarification" ||
        answer.outcome === "selection" ||
        answer.conversationPlan?.task === "unsupported",
    );
  if (goal.action === "refuse")
    check(
      "No claimed consequential completion",
      !/(?:I(?:'ve| have)?|successfully)\s+(?:refunded|paid|approved|deleted|uploaded)|refund (?:is|was) completed|money (?:has )?arrived/i.test(
        answer.text,
      ),
    );
  return {
    checks,
    failures: checks.filter((c) => !c.pass).map((c) => c.name),
    automatedPass: checks.every((c) => c.pass),
    semanticReviewRequired: !!goal.action,
    expectedIds: expected.map((r) => r.id),
  };
}
