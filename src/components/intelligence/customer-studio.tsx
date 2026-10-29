"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  AgStudio,
  createWidgets,
  type AgWidgetDefinition,
} from "ag-studio-react";
import {
  AgStudioAiModule,
  studioTheme,
  type AgBaseRegistry,
  type AgDefaultWidgetDefinition,
  type AgWidgetData,
  type AgWidgetDataFormat,
  type AgWidgetParams,
  type AgStudioApi,
  type AgReportState,
  type AgDataSourcesDefinition,
} from "ag-studio";
import type { CustomerDataset } from "@/lib/intelligence/customer-model";
import {
  validateCustomerPlan,
  scriptedCustomerPlan,
  type CustomerCommand,
  type CustomerPlan,
} from "@/lib/intelligence/customer-commands";
import {
  customerReport,
  commandSelection,
  matchingPurchases,
  emptyPurchaseFilters,
  insightPages,
  insightWidgets,
  widgetDefinition,
  savedCustomerLayout,
  restoreCustomerLayout,
  validateTarget,
  defaultCustomerWidgetIds,
  type InsightPage,
  type PurchaseFilters,
  type InsightWidget,
} from "@/lib/intelligence/customer-state";
import type { CareAnswer } from "@/lib/careos/contracts";
import { money } from "@/lib/demo/presentation";
import { Button } from "../ui/button";
import { CustomerRecords } from "./customer-records";
import { useInsightsControl } from "./customer-control";
import { AskCareOS } from "../careos/provider";
import { executeCustomerAgent } from "./customer-agent";
import { customerPlanApi } from "./customer-client";
import { ValueRecovery, AdjustmentStatus, EvidenceFreshness } from "./summary";
import {
  observedWidgets,
  nativeDisplayVerified,
  type NativeWidgetDisplay,
  stateFingerprint,
  type WidgetObservation,
} from "@/lib/intelligence/customer-observation";

type CustomId = "documents-care" | "attention" | "adjustments";
type CustomData = AgWidgetData<
  Record<string, never>,
  AgWidgetDataFormat<unknown>
> & { type: CustomId };
interface Registry extends AgBaseRegistry {
  widgets: readonly (
    AgDefaultWidgetDefinition | AgWidgetDefinition<CustomId, CustomData>
  )[];
}
type WidgetContext = {
  dataset: CustomerDataset;
  observation: () => { epoch: number; page: InsightPage };
  subscribeRefresh: (listener: () => void) => () => void;
  onRows: (id: string, ids: string[], epoch: number, page: InsightPage) => void;
  onFailure: (id: string, epoch: number, page: InsightPage) => void;
};

function PurchaseWidget(
  params: AgWidgetParams<CustomData, unknown, WidgetContext>,
) {
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current: AbortController | undefined;
    const request = async () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const observation = params.context.observation();
      try {
        params.widgetApi.setDisplayState("loading");
        const field = params.widgetApi
          .getSchema()
          .find((s) => s.id === "purchases")
          ?.fields.find((f) => f.key === "purchases.id" || f.fieldId === "id");
        if (!field) throw new Error("purchase_schema_missing");
        const result = await params.widgetApi.getData(
          { fields: [field] },
          { maxRows: 100, maxBytes: 100000, signal: controller.signal },
        );
        const selected = result.results.rows
          .map((r) => r["purchases.id"] ?? r.id)
          .filter((id): id is string => typeof id === "string");
        if (
          selected.some(
            (id) => !params.context.dataset.purchases.some((p) => p.id === id),
          )
        )
          throw new Error("unknown_purchase");
        if (!controller.signal.aborted) {
          setIds(selected);
          setError(false);
          params.context.onRows(
            params.widgetId,
            selected,
            observation.epoch,
            observation.page,
          );
          params.widgetApi.setDisplayState("displayed");
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
          params.context.onFailure(
            params.widgetId,
            observation.epoch,
            observation.page,
          );
          params.widgetApi.setDisplayState("displayed");
        }
      }
    };
    const unsubscribe = params.context.subscribeRefresh(() => void request());
    void request();
    return () => {
      unsubscribe();
      current?.abort();
    };
  }, [params]);
  const purchases = params.context.dataset.purchases.filter((p) =>
    ids.includes(p.id),
  );
  const adjustmentIds = new Set(purchases.flatMap((p) => p.adjustmentIds));
  const adjustmentFacts = params.context.dataset.adjustments.facts.filter((f) =>
    adjustmentIds.has(f.id),
  );
  const adjustmentUnavailable =
    !params.context.dataset.evidenceAvailable.adjustments;
  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        These widget records could not be validated. No amount or all-clear is
        implied.
      </p>
    );
  if (params.widgetType === "adjustments")
    return (
      <div className="h-full overflow-auto" data-testid="insight-adjustments">
        <div className="p-5">
          <h2 className="text-base font-semibold">
            Price adjustments, with evidence
          </h2>
          <p className="mt-2 text-3xl font-semibold">
            {adjustmentUnavailable
              ? "Unavailable"
              : money(
                  purchases.reduce((n, p) => n + p.verifiedAdjustmentMinor, 0),
                )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {adjustmentUnavailable
              ? "Adjustment evidence could not be read completely. No zero-refund conclusion is established."
              : "Independently verified Sandbox refunds for purchases in this selection. Not proposed savings."}
          </p>
        </div>
        {!adjustmentUnavailable && (
          <>
            <AdjustmentStatus facts={adjustmentFacts} />
            <EvidenceFreshness facts={adjustmentFacts} />
          </>
        )}
        {!adjustmentFacts.length && !adjustmentUnavailable && (
          <p className="px-5 pb-5 text-sm">
            No recorded adjustment cases. Older purchases do not acquire a new
            price policy.
          </p>
        )}
      </div>
    );
  if (params.widgetType === "attention")
    return (
      <div className="h-full overflow-auto p-5" data-testid="insight-attention">
        <h2 className="text-base font-semibold">What needs attention?</h2>
        <p className="my-3 text-sm text-muted-foreground">
          {params.context.dataset.evidenceAvailable.attention
            ? "Only recorded aftercare items appear here. Missing documents do not create a deadline or a safety warning."
            : "Attention evidence is unavailable or incomplete. Any loaded items below are partial; an empty list is not an all-clear."}
        </p>
        {(params.context.dataset.evidenceAvailable.attention ||
          purchases.some((p) => p.attentionCount > 0)) && (
          <CustomerRecords
            purchases={purchases.filter((p) => p.attentionCount > 0)}
            compact
          />
        )}
      </div>
    );
  return (
    <div
      className="h-full overflow-auto p-5"
      data-testid="insight-documents-care"
    >
      <h2 className="mb-3 text-base font-semibold">
        Your purchases & source records
      </h2>
      <CustomerRecords purchases={purchases} />
    </div>
  );
}

const theme = studioTheme
  .withParams(
    {
      fontFamily: "var(--font-geist-sans), sans-serif",
      accentColor: "#3157B7",
      backgroundColor: "#FFFFFF",
      foregroundColor: "#172033",
      borderColor: "#E2E8F3",
      browserColorScheme: "light",
    },
    "light",
  )
  .withParams(
    {
      fontFamily: "var(--font-geist-sans), sans-serif",
      accentColor: "#90AFFF",
      backgroundColor: "#121A2B",
      foregroundColor: "#F3F6FF",
      borderColor: "#2D3954",
      browserColorScheme: "dark",
    },
    "dark",
  );
const pageNames: Record<InsightPage, string> = {
  purchases: "My Purchases",
  documents: "Documents & Care",
  adjustments: "Price Adjustments",
};

function withSelection(
  state: AgReportState,
  ids: string[],
  page?: InsightPage,
): AgReportState {
  return {
    ...state,
    selectedPageId: page ?? state.selectedPageId,
    pages: state.pages.map((p) => ({
      ...p,
      crossFilter: undefined,
      filter: {
        ...p.filter,
        page: [
          {
            field: { id: "purchases.id" },
            model: ids.length
              ? {
                  operator: "OR",
                  conditions: ids.map((value) => ({
                    operator: "equals",
                    value,
                  })),
                }
              : { operator: "equals", value: "no-matching-purchase" },
          },
        ],
      },
    })),
  };
}

export function CustomerStudio({
  dataset,
  live,
}: {
  dataset: CustomerDataset;
  live: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const { register, phase } = useInsightsControl();
  const api = useRef<AgStudioApi | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<InsightPage>("purchases");
  const [crossCategory, setCrossCategory] = useState("");
  const [filters, setFilters] = useState<PurchaseFilters>({
    ...emptyPurchaseFilters,
  });
  const filtersRef = useRef(filters);
  const [rows, setRows] = useState(dataset.purchases.map((p) => p.id));
  const rowsRef = useRef<string[] | null>(null);
  const epochRef = useRef(0);
  const refreshListeners = useRef(new Set<() => void>());
  const observations = useRef(new Map<string, WidgetObservation>());
  const rowListeners = useRef(new Set<() => void>());
  const [notice, setNotice] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<InsightWidget>("category-chart");
  const conversation = useRef<string | null>(null);
  const compact = useMemo(
    () =>
      typeof window !== "undefined" && matchMedia("(max-width: 900px)").matches,
    [],
  );
  const initial = useMemo(() => customerReport(compact), [compact]);
  const onRows = useCallback(
    (
      id: string,
      ids: string[],
      generation: number,
      observedPage: InsightPage,
    ) => {
      if (
        generation !== epochRef.current ||
        observedPage !== api.current?.getState().selectedPageId
      )
        return;
      observations.current.set(id, {
        id,
        rows: ids,
        generation,
        page: observedPage,
      });
      if (id === "evidence") {
        rowsRef.current = ids;
        setRows((prior) =>
          JSON.stringify(prior) === JSON.stringify(ids) ? prior : ids,
        );
      }
      for (const listener of rowListeners.current) listener();
    },
    [],
  );
  const onFailure = useCallback(
    (id: string, generation: number, observedPage: InsightPage) => {
      observations.current.set(id, {
        id,
        rows: null,
        generation,
        page: observedPage,
      });
      for (const listener of rowListeners.current) listener();
    },
    [],
  );
  const observation = useCallback(
    () => ({
      epoch: epochRef.current,
      page: (api.current?.getState().selectedPageId ??
        "purchases") as InsightPage,
    }),
    [],
  );
  const subscribeRefresh = useCallback((listener: () => void) => {
    refreshListeners.current.add(listener);
    return () => {
      refreshListeners.current.delete(listener);
    };
  }, []);
  const context = useMemo(
    () => ({ dataset, onRows, onFailure, observation, subscribeRefresh }),
    [dataset, onRows, onFailure, observation, subscribeRefresh],
  );
  const data = useMemo<AgDataSourcesDefinition<Registry>>(
    () => ({
      sources: [
        {
          id: "purchases",
          name: "Available saved purchases",
          data: dataset.purchases.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            purchasedOn: p.purchasedOn,
            provenance: p.origin === "sandbox" ? "Verified Sandbox" : "Sample",
            paidUsd: p.amountMinor === null ? null : p.amountMinor / 100,
            documentCount: p.documentCount,
            careCount:
              p.careStatus === "unavailable" ? null : p.careAvailable ? 1 : 0,
            attentionCount:
              p.attentionStatus === "unavailable" ? null : p.attentionCount,
            count: 1,
          })),
          fields: [
            { id: "id", name: "Purchase record", format: "textFormat" },
            { id: "name", name: "Purchase", format: "textFormat" },
            { id: "category", name: "Category", format: "textFormat" },
            { id: "purchasedOn", name: "Purchase date", format: "textFormat" },
            {
              id: "provenance",
              name: "Purchase evidence",
              format: "textFormat",
            },
            {
              id: "paidUsd",
              name: "Recorded amount (USD)",
              format: "currencyFormat",
            },
            {
              id: "documentCount",
              name: "Saved documents",
              format: "integerFormat",
            },
            {
              id: "careCount",
              name: "Supported care",
              format: "integerFormat",
            },
            {
              id: "attentionCount",
              name: "Recorded attention items",
              format: "integerFormat",
            },
            { id: "count", name: "Purchases", format: "integerFormat" },
          ],
        },
      ],
    }),
    [dataset],
  );
  const widgets = useMemo(
    () =>
      createWidgets<Registry>({
        additionalTypes: (
          ["documents-care", "attention", "adjustments"] as CustomId[]
        ).map((id) => ({
          id,
          label:
            id === "documents-care"
              ? "Documents & Care"
              : id === "attention"
                ? "Attention & Next Steps"
                : "Adjustment Evidence",
          comp: PurchaseWidget,
          dataMapping: {},
          form: (p) => p.createDefaults({ dataMappingItems: [] }),
          toolbar: [],
          defaultSize: { width: 400, height: 420 },
          minSize: { width: 240, height: 160 },
          ai: {
            description:
              "Saved customer purchase evidence. Read-only, never financial authority.",
          },
        })),
        menu: [
          {
            label: "Personal Insights",
            widgetIds: [
              "grid",
              "bar-chart-grouped",
              "value",
              "documents-care",
              "attention",
              "adjustments",
            ],
          },
        ],
        defaultType: "grid",
      }),
    [],
  );

  const boundedWidgets = useMemo(
    () => ({
      ...widgets,
      widgets: widgets.widgets.map((widget) => ({ ...widget, toolbar: [] })),
    }),
    [widgets],
  );

  function select(next: PurchaseFilters, selectedPage?: InsightPage) {
    const current = api.current;
    if (!current) throw new Error("insights_not_ready");
    const ids = matchingPurchases(dataset.purchases, next).map((p) => p.id);
    const expected = withSelection(current.getState(), ids, selectedPage);
    current.setState(expected);
    const actual = current.getState();
    if (
      actual.selectedPageId !== expected.selectedPageId ||
      stateFingerprint(
        actual.pages.find((p) => p.id === actual.selectedPageId)?.filter?.page,
      ) !==
        stateFingerprint(
          expected.pages.find((p) => p.id === expected.selectedPageId)?.filter
            ?.page,
        )
    )
      throw new Error("insights_state_unverified");
    filtersRef.current = next;
    setFilters(next);
    if (selectedPage) setPage(selectedPage);
    return ids;
  }

  async function apply(command: CustomerCommand, signal: AbortSignal) {
    if (signal.aborted || !api.current) throw new Error("insights_cancelled");
    const current = api.current;
    if (command.operation === "reset")
      current.setState(customerReport(compact));
    const next = commandSelection(command, filtersRef.current);
    if (command.operation !== "evidence" && command.operation !== "widget")
      select(next.filters, next.page);
    if (command.operation === "widget") {
      const state = current.getState();
      const id = `extra-${command.widget}`;
      const updated = {
        ...state,
        pages: state.pages.map((p) =>
          p.id !== state.selectedPageId
            ? p
            : {
                ...p,
                widgets: {
                  ...p.widgets,
                  [id]: widgetDefinition(command.widget),
                },
                widgetLayout: {
                  ...p.widgetLayout,
                  [id]: p.widgetLayout?.[id] ?? {
                    xTrack: 0,
                    yTrack: Math.max(
                      0,
                      ...Object.values(p.widgetLayout ?? {}).map(
                        (v) => (v?.yTrack ?? 0) + (v?.ySpan ?? 0),
                      ),
                    ),
                    xSpan: 24,
                    ySpan: 24,
                  },
                },
              },
        ),
      };
      current.setState(updated as unknown as AgReportState);
      const observedPage = current
        .getState()
        .pages.find((p) => p.id === state.selectedPageId);
      const expectedWidget = widgetDefinition(command.widget);
      if (
        observedPage?.widgets?.[id]?.type !== expectedWidget.type ||
        JSON.stringify(observedPage.widgets[id].dataMapping) !==
          JSON.stringify(expectedWidget.dataMapping) ||
        JSON.stringify(observedPage.widgetLayout?.[id]) !==
          JSON.stringify(
            updated.pages.find((p) => p.id === state.selectedPageId)
              ?.widgetLayout?.[id],
          )
      )
        throw new Error("insights_widget_unverified");
    }
    if (command.operation === "evidence" || command.operation === "category") {
      const state = current.getState();
      const id = command.operation === "evidence" ? "evidence" : "categories";
      current.setState({
        ...state,
        pages: state.pages.map((p) =>
          p.id !== state.selectedPageId
            ? p
            : { ...p, selection: { type: "widget", id } },
        ),
      });
      const selection = current
        .getState()
        .pages.find((p) => p.id === state.selectedPageId)?.selection;
      if (selection?.type !== "widget" || selection.id !== id)
        throw new Error("insights_focus_unverified");
      validateTarget(
        current.getState(),
        state.selectedPageId as InsightPage,
        id,
        { selected: true },
      );
    }
    const checkedState = current.getState();
    for (const id of defaultCustomerWidgetIds[
      checkedState.selectedPageId as InsightPage
    ])
      validateTarget(
        checkedState,
        checkedState.selectedPageId as InsightPage,
        id,
      );
    // A valid state mutation alone is not a checked result. Confirm the actual
    // Studio data-engine rows observed by the source widget, including empty data.
    const expectedIds = (
      command.operation === "evidence" || command.operation === "widget"
        ? (rowsRef.current ?? [])
        : matchingPurchases(dataset.purchases, filtersRef.current).map(
            (p) => p.id,
          )
    )
      .slice()
      .sort();
    const generation = ++epochRef.current;
    const expectedPage = current.getState().selectedPageId;
    const expectedState = stateFingerprint(current.getState());
    const required = Object.entries(
      current.getState().pages.find((p) => p.id === expectedPage)?.widgets ??
        {},
    )
      .filter(([, widget]) =>
        ["documents-care", "attention", "adjustments"].includes(
          widget?.type ?? "",
        ),
      )
      .map(([id]) => id);
    const root = document.querySelector<HTMLElement>(
      '[data-testid="customer-studio"]',
    );
    if (!root) throw new Error("insights_not_rendered");
    const pageWidgets = Object.values(
      current.getState().pages.find((p) => p.id === expectedPage)?.widgets ??
        {},
    ).filter((w) => !!w);
    const nativeReady = () => {
      const wrappers = Array.from(
        root.querySelectorAll<HTMLElement>(".ag-studio-layout-widget"),
      );
      if (
        wrappers.length !== pageWidgets.length ||
        root.querySelector(".ag-studio-layout-widget-loading-overlay-active")
      )
        return false;
      const displays: NativeWidgetDisplay[] = [];
      const titles = new Set<string>();
      for (const definition of pageWidgets) {
        if (!["value", "grid", "bar-chart-grouped"].includes(definition!.type))
          continue;
        const title = (definition as { format?: { title?: { text?: string } } })
          .format?.title?.text;
        if (!title || titles.has(title)) continue;
        titles.add(title);
        const matches = wrappers.filter(
          (w) =>
            w
              .querySelector(".ag-studio-layout-widget-title")
              ?.textContent?.trim() === title,
        );
        const expected = pageWidgets.filter(
          (w) =>
            (w as { format?: { title?: { text?: string } } }).format?.title
              ?.text === title,
        ).length;
        if (matches.length !== expected) return false;
        for (const wrapper of matches) {
          const empty =
            expectedIds.length === 0 &&
            !!wrapper.querySelector(
              ".ag-studio-layout-widget-no-data-overlay-active",
            );
          const type = definition!.type as NativeWidgetDisplay["type"];
          const text = wrapper
            .querySelector(".ag-studio-value-widget-content")
            ?.textContent?.trim();
          const rowCount = wrapper
            .querySelector('[role="grid"]')
            ?.getAttribute("aria-rowcount");
          const canvas = wrapper.querySelector<HTMLCanvasElement>(
            ".ag-studio-chart-widget canvas",
          );
          displays.push({
            type,
            ready:
              type !== "bar-chart-grouped" ||
              empty ||
              !!(
                canvas?.width &&
                canvas.height &&
                wrapper.querySelector('figure, [role="figure"]')
              ),
            value: empty ? 0 : text ? Number(text.replaceAll(",", "")) : NaN,
            rows: empty ? 0 : rowCount ? Number(rowCount) - 1 : NaN,
          });
        }
      }
      return nativeDisplayVerified(displays, expectedIds.length);
    };
    await new Promise<void>((resolve, reject) => {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const cleanup = () => {
        observer?.disconnect();
        rowListeners.current.delete(listener);
        deadline.removeEventListener("abort", stop);
      };
      const stop = () => {
        cleanup();
        reject(new Error("insights_result_unverified"));
      };
      const listener = () => {
        if (stateFingerprint(current.getState()) !== expectedState) {
          cleanup();
          reject(new Error("insights_view_changed_during_execution"));
          return;
        }
        const result = observedWidgets(
          required,
          observations.current,
          generation,
          expectedPage,
          expectedIds,
        );
        if (result === "failed") {
          cleanup();
          reject(new Error("insights_widget_query_failed"));
          return;
        }
        if (result === "complete" && nativeReady()) {
          cleanup();
          resolve();
        }
      };
      rowListeners.current.add(listener);
      const observer = new MutationObserver(listener);
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      for (const refresh of refreshListeners.current) refresh();
      deadline.addEventListener("abort", stop, { once: true });
      if (deadline.aborted) stop();
    });
    if (command.operation === "evidence" || command.operation === "category") {
      const root = document.querySelector<HTMLElement>(
        '[data-testid="customer-studio"]',
      );
      const target =
        command.operation === "evidence"
          ? root?.querySelector<HTMLElement>(
              '[data-testid="insight-documents-care"] h2',
            )
          : Array.from(
              root?.querySelectorAll<HTMLElement>("div,span,h2") ?? [],
            ).find(
              (element) =>
                element.children.length === 0 &&
                element.textContent === "Purchases by category",
            );
      if (!target) throw new Error("insights_target_not_rendered");
      target.scrollIntoView({ block: "nearest", behavior: "instant" });
      // Keep the customer's reading/composer focus inside the open assistant.
      // Radix's nonmodal dialog otherwise closes on this focus-out.
      if (!document.querySelector('[role="dialog"]')) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
    return { empty: expectedIds.length === 0, nativeReady: true };
  }

  useEffect(() => {
    if (!ready) return;
    return register(
      async (message, requestId, signal, recovery) => {
        if (!api.current) throw new Error("insights_not_ready");
        let plan: CustomerPlan;
        const beforePlanning = stateFingerprint(api.current.getState());
        if (recovery.plan) plan = validateCustomerPlan(recovery.plan);
        else if (live) {
          if (!conversation.current)
            conversation.current = (
              await customerPlanApi<{ id: string }>(
                "POST",
                { action: "start" },
                undefined,
                signal,
              )
            ).id;
          recovery.planning(conversation.current!);
          plan = validateCustomerPlan(
            await customerPlanApi<unknown>(
              "POST",
              {
                action: "plan",
                conversationId: conversation.current,
                requestId,
                message,
              },
              undefined,
              signal,
            ),
          );
        } else
          plan = scriptedCustomerPlan(message) ?? {
            outcome: "unsupported",
            commands: [],
          };
        recovery.planned(plan);
        if (signal.aborted) throw new Error("insights_cancelled");
        if (stateFingerprint(api.current.getState()) !== beforePlanning)
          throw new Error("insights_view_changed_during_planning");
        if (plan.outcome === "unsupported")
          return {
            outcome: "unsupported",
            mode: live ? "live" : "fixture",
            context: null,
            revision: 0,
            text: live
              ? "I can help explore saved purchases, documents, care, and recorded adjustments. I cannot approve refunds or change purchase records."
              : "This preview supports the suggested purchase, category, documents, care, attention, verified-adjustment and reset questions. It uses scripted requests, not live AI.",
            steps: [],
            sources: [],
            actions: [],
          };
        const dependentUnavailable = plan.commands.some(
          (c) =>
            (c.operation === "care" && !dataset.evidenceAvailable.care) ||
            (c.operation === "attention" &&
              !dataset.evidenceAvailable.attention) ||
            (c.operation === "verified-adjustments" &&
              !dataset.evidenceAvailable.adjustments),
        );
        if (dependentUnavailable)
          return {
            outcome: "unavailable",
            mode: "deterministic",
            context: null,
            revision: 0,
            text: "The evidence needed for this view is unavailable or incomplete. I have not turned missing information into a zero, an all-clear, or a missing-care conclusion. Your saved purchases and documents are still available.",
            steps: [],
            sources: [],
            actions: [],
          };
        let names: string[];
        try {
          names = await executeCustomerAgent(api.current, plan, apply, signal);
        } catch (error) {
          const code =
            error instanceof Error && /^insights_[a-z_]+$/.test(error.message)
              ? error.message
              : "insights_execution_unverified";
          setNotice(
            `The requested view could not be verified (${code}). No automatic retry.`,
          );
          throw error;
        }
        setTools(names);
        const selected = dataset.purchases.filter((p) =>
          rowsRef.current?.includes(p.id),
        );
        const verified = selected.reduce(
          (n, p) => n + p.verifiedAdjustmentMinor,
          0,
        );
        const finding = plan.commands.some((c) => c.operation === "find");
        const adjustments = plan.commands.some(
          (c) => c.operation === "verified-adjustments",
        );
        const adjustmentUnavailable = dataset.unavailable.some((name) =>
          name.startsWith("Price Guardian"),
        );
        const answer: CareAnswer = {
          outcome: "answered",
          mode: recovery.plan ? "deterministic" : live ? "live" : "fixture",
          context: null,
          revision: 0,
          text:
            finding && selected.length > 1
              ? `I found ${selected.length} matching purchases. Choose the dated purchase or receipt in Source records; I have not chosen one for you.`
              : adjustments
                ? adjustmentUnavailable
                  ? "Price adjustment evidence is unavailable. I changed the view, but cannot establish a verified-refund total."
                  : `${money(verified)} in independently verified Sandbox price adjustments in this purchase view. ${verified ? "Open the recorded evidence below." : "No verified refund is recorded in this selection."}`
                : `${selected.length} saved ${selected.length === 1 ? "purchase" : "purchases"} in your updated view. The dashboard state was checked after the Studio tools ran.`,
          steps: [],
          sources: [],
          actions:
            selected.length === 1
              ? [
                  { label: "Open Purchase Twin", href: selected[0].href },
                  ...(selected[0].receiptHref
                    ? [{ label: "Open receipt", href: selected[0].receiptHref }]
                    : []),
                ]
              : [],
        };
        setNotice(
          "CareOS changed this view and checked the result. Purchase records are unchanged.",
        );
        return answer;
      },
      () => {
        conversation.current = null;
      },
    );
    // register closes over one immutable dataset/SDK instance. Live requests are aborted on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, register, dataset, live, compact]);

  const selected = dataset.purchases.filter((p) => rows.includes(p.id));
  const selectedAdjustmentIds = new Set(
    selected.flatMap((p) => p.adjustmentIds),
  );
  const selectedAdjustments = dataset.adjustments.facts.filter((f) =>
    selectedAdjustmentIds.has(f.id),
  );
  return (
    <>
      <div className="intelligence-wash mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
        <div>
          <h2 className="text-lg font-semibold">
            A little less to keep track of.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask CareOS to explore these records, or choose a view below.{" "}
            {live
              ? "Private live planning requires your Studio scope."
              : "Suggested questions use actual Studio tools with scripted planning · no live AI."}
          </p>
        </div>
        <AskCareOS>Explore with CareOS</AskCareOS>
      </div>
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Insight views">
        {insightPages.map((id) => (
          <Button
            key={id}
            variant={page === id ? "default" : "outline"}
            aria-pressed={page === id}
            disabled={!ready || phase !== "idle" || adding}
            onClick={() => {
              const current = api.current!;
              current.setState({ ...current.getState(), selectedPageId: id });
              setPage(id);
            }}
          >
            {pageNames[id]}
          </Button>
        ))}
      </div>
      <fieldset
        disabled={!ready || phase !== "idle" || adding}
        className="mb-4 flex min-w-0 flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"
      >
        <legend className="px-2 text-sm font-semibold">
          Explore your purchases
        </legend>
        <label className="min-w-0 max-w-full text-sm">
          Purchase evidence
          <select
            aria-label="Purchase evidence"
            className="mt-2 block min-h-11 w-full max-w-full rounded-xl border bg-card px-3"
            value={filters.origin}
            onChange={(e) =>
              select({ ...filtersRef.current, origin: e.target.value })
            }
          >
            <option value="all">All evidence types</option>
            <option value="sandbox">Verified Sandbox only</option>
            <option value="sample">Samples only</option>
          </select>
        </label>
        <label className="min-w-0 max-w-full text-sm">
          Category
          <select
            aria-label="Category"
            className="mt-2 block min-h-11 w-full max-w-full rounded-xl border bg-card px-3"
            value={filters.category}
            onChange={(e) =>
              select({ ...filtersRef.current, category: e.target.value })
            }
          >
            <option value="all">All categories</option>
            {[...new Set(dataset.purchases.map((p) => p.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm">
          From
          <input
            type="date"
            className="mt-2 block min-h-11 w-full rounded-xl border bg-card px-3"
            value={filters.from}
            onChange={(e) =>
              select({ ...filtersRef.current, from: e.target.value })
            }
          />
        </label>
        <label className="min-w-0 text-sm">
          Through
          <input
            type="date"
            className="mt-2 block min-h-11 w-full rounded-xl border bg-card px-3"
            value={filters.to}
            onChange={(e) =>
              select({ ...filtersRef.current, to: e.target.value })
            }
          />
        </label>
        <Button
          variant="outline"
          onClick={() => select({ ...emptyPurchaseFilters })}
        >
          Clear filters
        </Button>
      </fieldset>
      <p
        aria-label="Personal Insights filter scope"
        className="mb-4 text-sm text-muted-foreground"
      >
        {selected.length} purchases in the current Studio selection ·{" "}
        {filters.origin === "all"
          ? "samples and verified records labeled separately"
          : filters.origin === "sample"
            ? "samples only"
            : "verified Sandbox only"}
        {filters.documents ? " · with documents" : ""}
        {filters.care ? " · supported care" : ""}
        {filters.attention ? " · recorded attention items" : ""}
        {filters.verified ? " · verified adjustments only" : ""}
        {filters.query ? ` · matching “${filters.query}”` : ""}. Chart
        selections cross-filter the other widgets; Clear filters also clears
        chart selections.
      </p>
      {page === "purchases" && (
        <div
          role="group"
          aria-label="Chart category selection"
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-muted-foreground">
            Cross-filter by category:
          </span>
          {[...new Set(dataset.purchases.map((p) => p.category))].map(
            (category) => (
              <Button
                key={category}
                size="sm"
                variant="outline"
                aria-pressed={crossCategory === category}
                disabled={!ready || phase !== "idle" || adding}
                onClick={() => {
                  const current = api.current!;
                  const state = current.getState();
                  current.setState({
                    ...state,
                    pages: state.pages.map((p) =>
                      p.id !== "purchases"
                        ? p
                        : {
                            ...p,
                            crossFilter: {
                              values: {
                                categories: [
                                  {
                                    group: 0,
                                    type: "value",
                                    field: { id: "purchases.category" },
                                    values: [category],
                                  },
                                ],
                              },
                            },
                          },
                    ),
                  });
                }}
              >
                {category}
              </Button>
            ),
          )}
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!ready || phase !== "idle" || adding}
          onClick={() => setEdit(!edit)}
        >
          {edit ? "Finish layout editing" : "Customize layout"}
        </Button>
        <Button
          variant="outline"
          disabled={!ready || phase !== "idle" || adding}
          onClick={() => {
            try {
              localStorage.setItem(
                `palcare-personal-layout:v1:${dataset.source}:${compact ? "compact" : "wide"}`,
                JSON.stringify(savedCustomerLayout(api.current!.getState())),
              );
              setNotice(
                "Layout saved in this browser. No purchase records changed.",
              );
            } catch {
              setNotice(
                "Layout could not be saved. Your current workspace remains available.",
              );
            }
          }}
        >
          Save layout
        </Button>
        <Button
          variant="outline"
          disabled={!ready || phase !== "idle" || adding}
          onClick={() => {
            try {
              api.current!.setState(
                restoreCustomerLayout(
                  api.current!.getState(),
                  JSON.parse(
                    localStorage.getItem(
                      `palcare-personal-layout:v1:${dataset.source}:${compact ? "compact" : "wide"}`,
                    ) ?? "null",
                  ),
                ),
              );
              setNotice("Saved layout restored.");
            } catch {
              setNotice(
                "No valid saved layout is available. Your current view is unchanged.",
              );
            }
          }}
        >
          Restore layout
        </Button>
        <Button
          variant="outline"
          disabled={!ready || phase !== "idle" || adding}
          onClick={() => {
            api.current!.setState(customerReport(compact));
            select({ ...emptyPurchaseFilters }, "purchases");
            setNotice("Default views restored. Saved purchases are unchanged.");
          }}
        >
          Reset views
        </Button>
      </div>
      {edit && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4">
          <label className="text-sm">
            Add a useful widget
            <select
              aria-label="Add a useful widget"
              className="mt-2 block min-h-11 rounded-xl border bg-card px-3"
              value={add}
              onChange={(e) => setAdd(e.target.value as InsightWidget)}
            >
              {insightWidgets.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <Button
            disabled={adding || phase !== "idle"}
            onClick={() => {
              setAdding(true);
              void apply(
                { operation: "widget", widget: add },
                new AbortController().signal,
              )
                .then(() =>
                  setNotice("Widget added. Adding it again keeps one copy."),
                )
                .catch(() =>
                  setNotice(
                    "The added widget could not be verified. Inspect the current layout; no automatic retry.",
                  ),
                )
                .finally(() => setAdding(false));
            }}
          >
            Add widget
          </Button>
          <p className="text-sm text-muted-foreground">
            Move or resize widgets in Studio, or use Reset views. Layout changes
            are browser-only.
          </p>
        </div>
      )}
      <div
        data-testid="customer-studio"
        inert={phase !== "idle" || adding}
        className="ag-theme-mode relative h-[760px] min-w-0 overflow-hidden rounded-2xl border"
        data-ag-theme-mode={resolvedTheme === "dark" ? "dark" : "light"}
      >
        <AgStudio<Registry>
          style={{ height: "100%", width: "100%" }}
          data={data}
          context={context}
          widgets={boundedWidgets}
          initialState={initial as unknown as AgReportState<Registry>}
          theme={theme}
          layout={{ minWidth: 0, columns: 24, rowHeight: 16 }}
          loadThemeGoogleFonts={false}
          mode={edit ? "edit" : "view"}
          panels={{
            view: { left: [], right: [] },
            edit: { left: [], right: [] },
          }}
          modules={[AgStudioAiModule]}
          onApiReady={(event) => {
            api.current = event.api as unknown as AgStudioApi;
            setReady(true);
          }}
          onStateUpdated={(event) => {
            if (
              insightPages.includes(event.state.selectedPageId as InsightPage)
            )
              setPage(event.state.selectedPageId as InsightPage);
            const selectedCategory = event.state.pages.find(
              (p) => p.id === "purchases",
            )?.crossFilter?.values?.categories?.[0];
            setCrossCategory(
              selectedCategory?.type === "value" &&
                typeof selectedCategory.values[0] === "string"
                ? selectedCategory.values[0]
                : "",
            );
          }}
          onErrorRaised={() =>
            setNotice(
              "Studio reported a configuration issue. Inspect the source records below; no financial outcome is implied.",
            )
          }
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Actual AG Studio 3.0.0 · local evaluation, vendor notices retained.
        Public judging license coverage is not yet established. Recorded amounts
        include labeled fictional samples; this is not a spending or coverage
        statement.
      </p>
      {notice && (
        <p role="status" className="mt-4 text-sm">
          {notice}
        </p>
      )}
      {!!tools.length && (
        <details className="mt-4 text-sm">
          <summary className="min-h-11 cursor-pointer py-3">
            How CareOS changed this view
          </summary>
          <p data-testid="customer-studio-tools">
            Executed: {tools.join(" → ")}. Presentation state read back and
            checked. No financial tools.
          </p>
        </details>
      )}
      <details className="mt-5 rounded-2xl border bg-card p-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Source records & accessible summary · {selected.length} purchases
        </summary>
        <CustomerRecords purchases={selected} />
        {page === "adjustments" &&
          !dataset.unavailable.some((name) =>
            name.startsWith("Price Guardian"),
          ) && (
            <>
              <ValueRecovery facts={selectedAdjustments} />
              <AdjustmentStatus facts={selectedAdjustments} />
              <EvidenceFreshness facts={selectedAdjustments} />
            </>
          )}
      </details>
    </>
  );
}
