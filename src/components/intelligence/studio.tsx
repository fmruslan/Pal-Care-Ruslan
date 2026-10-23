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
  type AgBaseRegistry,
  type AgDefaultWidgetDefinition,
  type AgWidgetData,
  type AgWidgetDataFormat,
  type AgWidgetParams,
  type AgReportState,
  type AgStudioApi,
  type AgDataSourcesDefinition,
} from "ag-studio";
import {
  factSchema,
  type IntelligenceFact,
  type IntelligenceDataset,
} from "@/lib/intelligence/model";
import { ValueRecovery, AdjustmentStatus, EvidenceFreshness } from "./summary";
import { Button } from "../ui/button";
import { layoutSchema } from "@/lib/intelligence/layout";

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
            const field = params.widgetApi
              .getSchema()
              .find((t) => t.id === "cases")
              ?.fields.find((f) => f.fieldId === "cases.stage");
            if (field)
              params.widgetApi.toggleCrossFilter({
                type: "value",
                field,
                value: stage,
                group: 0,
              });
          }}
        />
      )}
    </div>
  );
}
export function defaultReport(): AgReportState<Registry> {
  return {
    pages: [
      {
        id: "care",
        widgets: {
          recovery: { type: "value-recovery", dataMapping: {} },
          status: { type: "adjustment-status", dataMapping: {} },
          evidence: { type: "evidence-freshness", dataMapping: {} },
        },
        widgetLayout: {
          recovery: { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 28 },
          status: { xTrack: 8, yTrack: 0, xSpan: 8, ySpan: 28 },
          evidence: { xTrack: 16, yTrack: 0, xSpan: 8, ySpan: 28 },
        },
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
}: {
  dataset: IntelligenceDataset;
}) {
  const { resolvedTheme } = useTheme(),
    api = useRef<AgStudioApi<Registry> | null>(null);
  const [edit, setEdit] = useState(false),
    [notice, setNotice] = useState("");
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
  const context = useMemo(() => ({ mode: dataset.mode }), [dataset.mode]);
  const initial = useMemo(() => defaultReport(), []);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setEdit((e) => !e)}>
          {edit ? "Finish layout editing" : "Customize local layout"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.setState(defaultReport());
            setNotice("Default layout restored. No commerce records changed.");
          }}
        >
          Reset layout
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            try {
              localStorage.setItem(
                `palcare-studio-layout:${dataset.mode}`,
                JSON.stringify(
                  layoutSchema.parse(
                    api.current?.getState().pages?.find((p) => p.id === "care")
                      ?.widgetLayout,
                  ),
                ),
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
              const report = defaultReport();
              report.pages![0].widgetLayout = saved;
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
      <div
        className="ag-theme-mode h-[640px] min-w-0 rounded-2xl border"
        data-ag-theme-mode={resolvedTheme === "dark" ? "dark" : "light"}
      >
        <AgStudio<Registry>
          style={{ height: "100%", width: "100%" }}
          data={data}
          widgets={widgets}
          context={context}
          initialState={initial}
          theme={theme}
          loadThemeGoogleFonts={false}
          mode={edit ? "edit" : "view"}
          panels={{ view: { left: [], right: [] } }}
          onApiReady={(e) => {
            // The v3 event type erases this instance's custom registry.
            api.current = e.api as unknown as AgStudioApi<Registry>;
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
