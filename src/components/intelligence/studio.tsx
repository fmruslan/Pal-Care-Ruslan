"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { useTheme } from "next-themes";
import {
  AgStudio,
  createWidgets,
  type AgWidgetDefinition,
} from "ag-studio-react";
import {
  studioTheme,
  AgStudioAiModule,
  type AgBaseRegistry,
  type AgDefaultWidgetDefinition,
  type AgWidgetData,
  type AgWidgetDataFormat,
  type AgWidgetParams,
  type AgReportState,
  type AgStudioApi,
  type AgDataSourcesDefinition,
  type AgAiHarness,
  type AgAiChatSession,
} from "ag-studio";
import {
  factSchema,
  type IntelligenceFact,
  type IntelligenceDataset,
} from "@/lib/intelligence/model";
import { ValueRecovery, AdjustmentStatus, EvidenceFreshness } from "./summary";
import { Button } from "../ui/button";
import { layoutSchema, defaultPositions } from "@/lib/intelligence/layout";
import { dashboardHarness } from "./agent";
import type { DashboardCommand } from "@/lib/intelligence/commands";
import { scriptedPrompts } from "@/lib/intelligence/commands";
import { pageStage, withPageStage } from "@/lib/intelligence/filters";

type WidgetId = "value-recovery" | "adjustment-status" | "evidence-freshness";
type CustomData = AgWidgetData<
  Record<string, never>,
  AgWidgetDataFormat<unknown>
> & { type: WidgetId };
interface Registry extends AgBaseRegistry {
  widgets: readonly (
    AgDefaultWidgetDefinition | AgWidgetDefinition<WidgetId, CustomData>
  )[];
}
const fields = Object.keys(factSchema.shape);
function StudioWidget(params: AgWidgetParams<CustomData>) {
  const [facts, setFacts] = useState<IntelligenceFact[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const request = async () => {
      try {
        params.widgetApi.setDisplayState("loading");
        const schema = params.widgetApi
          .getSchema()
          .find((t) => t.id === "cases");
        if (!schema) throw new Error();
        const response = await params.widgetApi.getData(
          { fields: schema.fields },
          { maxRows: 500, maxBytes: 1000000, signal: controller.signal },
        );
        const rows = response.results.rows.map((row) =>
          factSchema.parse(
            Object.fromEntries(
              fields.map((key) => [
                key,
                row[`cases.${key}`] ??
                  row[key] ??
                  (key === "href" ? null : undefined),
              ]),
            ),
          ),
        );
        if (active) {
          setFacts(rows);
          setError(false);
          params.widgetApi.setDisplayState("displayed");
        }
      } catch {
        if (active) {
          setError(true);
          params.widgetApi.setDisplayState("displayed");
        }
      }
    };
    void request();
    return () => {
      active = false;
      controller.abort();
    };
  }, [params]);
  const example = params.context?.mode === "illustrative";
  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        Widget data could not be validated. No financial amount is implied.
      </p>
    );
  return (
    <div
      className="h-full overflow-auto text-foreground"
      data-testid={`studio-${params.widgetType}`}
    >
      {params.widgetType === "value-recovery" ? (
        <ValueRecovery facts={facts} example={example} />
      ) : params.widgetType === "evidence-freshness" ? (
        <EvidenceFreshness facts={facts} example={example} />
      ) : (
        <AdjustmentStatus
          facts={facts}
          onStage={(stage) => {
            params.context.onStage(stage);
          }}
        />
      )}
    </div>
  );
}
export function defaultReport(compact = false): AgReportState<Registry> {
  return {
    pages: [
      {
        id: "care",
        widgets: {
          recovery: { type: "value-recovery", dataMapping: {} },
          status: { type: "adjustment-status", dataMapping: {} },
          evidence: { type: "evidence-freshness", dataMapping: {} },
        },
        widgetLayout: defaultPositions(compact),
      },
    ],
    selectedPageId: "care",
    panels: {
      data: { collapsed: true },
      edit: { collapsed: true },
      filters: { collapsed: true },
    },
  };
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
export function IntelligenceStudio({
  dataset,
  stage,
  onStage,
}: {
  dataset: IntelligenceDataset;
  stage: string;
  onStage: (stage: string) => void;
}) {
  const stageRef = useRef(stage),
    onStageRef = useRef(onStage);
  useEffect(() => {
    stageRef.current = stage;
    onStageRef.current = onStage;
  }, [stage, onStage]);
  const compact = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px)").matches,
    [],
  );
  const { resolvedTheme } = useTheme(),
    api = useRef<AgStudioApi<Registry> | null>(null);
  const harness = useRef<AgAiHarness | null>(null),
    session = useRef<AgAiChatSession | null>(null);
  const [edit, setEdit] = useState(false),
    [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState("");
  const widgets = useMemo(
    () =>
      createWidgets<Registry>({
        additionalTypes: (
          [
            ["value-recovery", "Value Recovery"],
            ["adjustment-status", "Adjustment Status"],
            ["evidence-freshness", "Evidence & Freshness"],
          ] as [WidgetId, string][]
        ).map(([id, label]) => ({
          id,
          label,
          comp: StudioWidget,
          dataMapping: {},
          form: (p) => p.createDefaults({ dataMappingItems: [] }),
          defaultSize: { width: 360, height: 440 },
          minSize: { width: 260, height: 220 },
          ai: {
            description: `CareOS ${label}. Scoped case window; illustrative data is never provider evidence.`,
          },
        })),
        menu: [
          {
            label: "CareOS Intelligence",
            widgetIds: [
              "value-recovery",
              "adjustment-status",
              "evidence-freshness",
            ],
          },
        ],
        defaultType: "value-recovery",
      }),
    [],
  );
  const data = useMemo<AgDataSourcesDefinition<Registry>>(
    () => ({
      sources: [
        {
          id: "cases",
          name: "Guardian cases · bounded window",
          data: dataset.facts,
          fields: fields.map((id) => ({
            id,
            name: id,
            format: ["amountMinor", "originalMinor", "comparedMinor"].includes(
              id,
            )
              ? "integerFormat"
              : "textFormat",
          })),
        },
      ],
    }),
    [dataset.facts],
  );
  const context = useMemo(
    () => ({
      mode: dataset.mode,
      onStage: (value: string) =>
        onStageRef.current(stageRef.current === value ? "All" : value),
    }),
    [dataset.mode],
  );
  const initial = useMemo(
    () => withPageStage(defaultReport(compact), stage),
    [compact, stage],
  );
  useEffect(() => {
    if (!ready || !api.current) return;
    const current = api.current.getState();
    if (
      pageStage(current) !== stage ||
      current.pages?.some((p) => p.id === "care" && p.crossFilter)
    )
      api.current.setState(withPageStage(current, stage));
  }, [stage, ready]);
  const ai = useMemo(
    () =>
      ({ api: studioApi }: { api: AgStudioApi }) => {
        if (harness.current) return harness.current;
        harness.current = dashboardHarness(
          studioApi,
          (command: DashboardCommand) => {
            const current = api.current;
            if (!current) return;
            if (command.operation === "reset") {
              onStageRef.current("All");
              current.setState(defaultReport(compact));
              return;
            }
            const state = current.getState();
            const page = state.pages?.find((p) => p.id === "care");
            if (!page) return;
            const stage =
              command.operation === "proposed"
                ? "Proposed"
                : command.operation === "pending"
                  ? "Pending"
                  : "Verified";
            const filter = {
              field: { id: "cases.stage" },
              model: { operator: "equals" as const, value: stage },
            };
            if (command.operation === "add-summary") {
              const id = "verified-summary";
              current.setState({
                ...state,
                pages: state.pages?.map((p) =>
                  p.id !== "care"
                    ? p
                    : {
                        ...p,
                        widgets: {
                          ...p.widgets,
                          [id]: { type: "value-recovery", dataMapping: {} },
                        },
                        widgetLayout: {
                          ...p.widgetLayout,
                          [id]: {
                            xTrack: 0,
                            yTrack: compact ? 86 : 30,
                            xSpan: compact ? 24 : 12,
                            ySpan: 28,
                          },
                        },
                        filter: {
                          ...p.filter,
                          widget: { ...p.filter?.widget, [id]: [filter] },
                        },
                      },
                ),
              });
            } else if (command.operation === "evidence") {
              current.setState({
                ...state,
                pages: state.pages?.map((p) =>
                  p.id !== "care"
                    ? p
                    : { ...p, selection: { type: "widget", id: "evidence" } },
                ),
              });
            } else {
              onStageRef.current(stage);
              current.setState(withPageStage(state, stage));
            }
            setNotice(
              `Scripted ${command.operation} applied. No commerce changes.`,
            );
          },
        );
        return harness.current;
      },
    [setNotice, compact],
  );
  async function runScript(prompt: string) {
    if (!harness.current || busy) return;
    setBusy(true);
    try {
      if (!session.current) {
        session.current = await harness.current.createThread({
          agentId: "care-scripted",
        });
        session.current.addEventListener("changed", () => {
          const s = session.current;
          if (!s) return;
          setBusy(s.status === "running");
          const last = s.messages.filter((m) => m.role === "assistant").at(-1);
          setReply(
            last?.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("") ?? "",
          );
        });
      }
      session.current.sendMessage(prompt);
    } catch {
      setBusy(false);
      setReply(
        "Scripted command unavailable. No financial operation occurred.",
      );
    }
  }
  useEffect(
    () => () => {
      session.current?.cancel();
      session.current?.close();
    },
    [],
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setEdit((e) => !e)}>
          {edit ? "Finish layout editing" : "Customize local layout"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.setState(
              withPageStage(defaultReport(compact), stageRef.current),
            );
            setNotice("Default layout restored. No commerce records changed.");
          }}
        >
          Reset layout
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            try {
              const positions = api.current
                ?.getState()
                .pages?.find((p) => p.id === "care")?.widgetLayout;
              const baseLayout = Object.fromEntries(
                ["recovery", "status", "evidence"].map((id) => [
                  id,
                  positions?.[id],
                ]),
              );
              localStorage.setItem(
                `palcare-studio-layout:${dataset.mode}`,
                JSON.stringify(layoutSchema.parse(baseLayout)),
              );
              setNotice("Three-widget layout saved in this browser only.");
            } catch {
              setNotice("Browser storage unavailable. Dashboard still works.");
            }
          }}
        >
          Save layout locally
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            try {
              const saved = layoutSchema.parse(
                JSON.parse(
                  localStorage.getItem(
                    `palcare-studio-layout:${dataset.mode}`,
                  ) ?? "null",
                ),
              );
              const report = withPageStage(
                api.current?.getState() ?? defaultReport(compact),
                stageRef.current,
              );
              report.pages = report.pages?.map((p) =>
                p.id !== "care"
                  ? p
                  : { ...p, widgetLayout: { ...p.widgetLayout, ...saved } },
              );
              api.current?.setState(report);
              setNotice("Saved layout restored. Commerce records unchanged.");
            } catch {
              setNotice(
                "No valid saved layout. Default dashboard remains available.",
              );
            }
          }}
        >
          Restore saved layout
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Local evaluation · vendor watermark retained · no license coverage for
        public judging established.
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Shared page filter: {stage}. An added verified-only summary intersects
        this selection; it does not change stored totals.
      </p>
      <section
        aria-label="Scripted Studio assistant"
        className="intelligence-wash mb-4 rounded-2xl border p-4"
      >
        <p className="text-sm font-semibold text-intelligence-foreground">
          Studio assistant · scripted demonstration · no live AI
        </p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          These supported prompts run through the actual Studio Agent Framework
          and allowlisted presentation tools. No financial tools or paid
          inference.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {scriptedPrompts.map(([prompt]) => (
            <Button
              key={prompt}
              variant="outline"
              size="sm"
              disabled={!ready || busy}
              onClick={() => void runScript(prompt)}
            >
              {prompt}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={!busy}
            onClick={() => session.current?.cancel()}
          >
            Cancel command
          </Button>
        </div>
        {reply && (
          <p role="status" className="mt-3 text-sm">
            {reply}
          </p>
        )}
      </section>
      <div
        className="ag-theme-mode relative h-[640px] min-w-0 overflow-hidden rounded-2xl border"
        data-ag-theme-mode={resolvedTheme === "dark" ? "dark" : "light"}
      >
        <AgStudio<Registry>
          style={{ height: "100%", width: "100%" }}
          data={data}
          widgets={widgets}
          context={context}
          initialState={initial}
          theme={theme}
          layout={{ minWidth: 0, columns: 24, rowHeight: 16 }}
          loadThemeGoogleFonts={false}
          mode={edit ? "edit" : "view"}
          panels={{ view: { left: [], right: [] } }}
          modules={[AgStudioAiModule]}
          ai={ai}
          onApiReady={(e) => {
            // The v3 event type erases this instance's custom registry.
            api.current = e.api as unknown as AgStudioApi<Registry>;
            ai({ api: e.api });
            setReady(true);
          }}
          onStateUpdated={(event) => {
            const selected = pageStage(event.state);
            if (selected !== stageRef.current) onStageRef.current(selected);
          }}
          onErrorRaised={() =>
            setNotice(
              "AG Studio reported a configuration issue. The read-only summary remains available.",
            )
          }
        />
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </>
  );
}
