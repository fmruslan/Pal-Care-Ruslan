"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  AgStudio,
  createWidgets,
  type AgWidgetDefinition,
} from "ag-studio-react";
import type {
  AgBaseRegistry,
  AgDefaultWidgetDefinition,
  AgWidgetData,
  AgWidgetDataFormat,
  AgWidgetParams,
  AgStudioApi,
  AgReportState,
} from "ag-studio";
import { ProductArt } from "../product-art";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import { purchaseStudioTheme } from "../intelligence/studio-theme";
import {
  careEventCounts,
  type CareCalendar,
  type CareCalendarEvent,
} from "@/lib/care/calendar";
import {
  careCalendarData,
  careCalendarReport,
  careCalendarFilter,
  expectedCalendarIds,
  validateCalendarRows,
} from "@/lib/intelligence/care-calendar-state";

type CustomData = AgWidgetData<
  Record<string, never>,
  AgWidgetDataFormat<unknown>
> & { type: "care-timeline" };
interface Registry extends AgBaseRegistry {
  widgets: readonly (
    AgDefaultWidgetDefinition | AgWidgetDefinition<"care-timeline", CustomData>
  )[];
}
type Context = {
  calendar: CareCalendar;
  all: boolean;
  selection: () => { all: boolean; evidence: string };
  subscribe: (fn: () => void) => () => void;
};
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T00:00:00Z"));
function TimelineWidget(params: AgWidgetParams<CustomData, unknown, Context>) {
  const scroller = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<CareCalendarEvent[] | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let current: AbortController | undefined;
    const request = async () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      try {
        params.widgetApi.setDisplayState("loading");
        const field = params.widgetApi
          .getSchema()
          .find((s) => s.id === "careEvents")
          ?.fields.find((f) => f.key === "careEvents.id" || f.fieldId === "id");
        if (!field) throw Error("calendar_schema_missing");
        const selection = params.context.selection();
        const result = await params.widgetApi.getData(
          { fields: [field] },
          { maxRows: 1000, maxBytes: 1000000, signal: controller.signal },
        );
        const selected = validateCalendarRows(
          result.results.rows,
          expectedCalendarIds(
            params.context.calendar,
            selection.all,
            selection.evidence,
          ),
          params.context.calendar.events,
        );
        if (!controller.signal.aborted) {
          setEvents(selected);
          setError(false);
          params.widgetApi.setDisplayState("displayed");
        }
      } catch {
        if (!controller.signal.aborted) {
          setEvents(null);
          setError(true);
          params.widgetApi.setDisplayState("displayed");
        }
      }
    };
    const unsubscribe = params.context.subscribe(() => void request());
    void request();
    return () => {
      unsubscribe();
      current?.abort();
    };
  }, [params]);
  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        Care timeline data could not be verified through Studio. No dates or
        empty-state conclusion are implied.
      </p>
    );
  if (!events)
    return (
      <p role="status" className="p-5 text-sm">
        Reading saved Care events through Studio…
      </p>
    );
  const calendar = params.context.calendar,
    counts = careEventCounts(events);
  const upcoming = events.filter((e) => calendar.days.includes(e.day));
  // The compact calendar is always today's 30 days, even in Insights. Its native
  // grid below contains the entire relevant dated selection, including history.
  const visible = upcoming.slice(0, 12);
  const weeks = [0, 7, 14, 21, 28].map((start) =>
    calendar.days.slice(start, start + 7),
  );
  return (
    <div
      data-care-calendar-engine="verified"
      data-care-calendar-ids={events
        .map((e) => e.id)
        .sort()
        .join("|")}
      className="h-full min-w-0 overflow-auto px-3 pb-2 text-foreground sm:px-4"
    >
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 pb-1 text-xs leading-6 text-muted-foreground">
        <span data-care-calendar-dates>
          {dateLabel(calendar.today)} – {dateLabel(calendar.days[29])},{" "}
          {calendar.days[29].slice(0, 4)} · UTC
        </span>
        <span data-care-event-counts>
          {counts.demo} Demo · {counts.verified} verified Sandbox ·{" "}
          {counts.recorded} recorded, unverified
          {params.context.all ? " · all saved dates" : ""}
        </span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Scroll horizontally for all 30 days. Demo dates are fictional; estimates
        are not confirmed delivery. Today starts this rolling window; quiet days
        are compressed.
      </p>
      <div className="flex justify-end gap-3 text-xs font-semibold text-intelligence-foreground">
        <button
          className="min-h-11 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() =>
            scroller.current?.scrollTo({ left: 0, behavior: "instant" })
          }
        >
          Today
        </button>
        <button
          className="min-h-11 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            const el = scroller.current;
            if (el)
              el.scrollBy({ left: el.clientWidth * 0.8, behavior: "instant" });
          }}
        >
          Next dates →
        </button>
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="30-day Care calendar, scroll horizontally"
        tabIndex={0}
        className="mt-2 overflow-x-auto rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <div
          className="relative flex h-56 w-max min-w-full"
          aria-label="Weeks and dated events"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-8 border-t border-border"
          />
          {weeks.map((days, week) => (
            <div key={days[0]} className="relative flex min-w-[9rem]">
              <div className="absolute inset-x-0 top-0 border-l pl-2 text-xs leading-5">
                <span className="font-semibold">Week {week + 1}</span>
                <br />
                <span data-care-calendar-dates className="inline-block w-36">
                  {dateLabel(days[0])} – {dateLabel(days.at(-1)!)}
                </span>
              </div>
              {days.map((day, index) => {
                const items = visible.filter((event) => event.day === day),
                  today = day === calendar.today;
                const labelled =
                  today ||
                  items.length > 0 ||
                  index === 0 ||
                  day === calendar.days[29];
                return (
                  <div
                    key={day}
                    className="relative shrink-0"
                    style={{
                      width: `${Math.max(items.length * 12, today ? 4 : index === 0 ? 5 : day === calendar.days[29] ? 5 : 1.5)}rem`,
                    }}
                  >
                    <ol
                      aria-label={`Care events ${day}`}
                      className="absolute inset-x-0 top-14 flex list-none gap-2 px-1"
                    >
                      {items.map((event) => (
                        <li key={event.id} className="w-[11.5rem] shrink-0">
                          <Link
                            href={event.href}
                            data-care-calendar-event={event.id}
                            className="relative flex min-h-24 items-start gap-2 rounded-xl border border-primary/40 bg-background p-2.5 text-sm shadow-sm transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                          >
                            <span className="shrink-0 [&>div]:size-9 [&_svg]:h-9 [&_svg]:w-10">
                              <ProductArt
                                kind={event.illustration}
                                size="thumbnail"
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">
                                {event.product}
                              </span>
                              <span className="block text-xs leading-4">
                                {event.kind}
                              </span>
                              <span className="block text-xs leading-5 text-muted-foreground">
                                <time dateTime={event.date}>
                                  {dateLabel(day)}
                                </time>{" "}
                                · {event.evidence}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                    {labelled && (
                      <>
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-[1.6875rem] left-1/2 size-2.5 -translate-x-1/2 rounded-full border-2 bg-card ${today ? "border-intelligence-border" : "border-primary"}`}
                        />
                        {items.length > 0 && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-9 left-1/2 h-8 border-l border-primary/40"
                          />
                        )}
                        <span
                          data-care-calendar-dates
                          className={`absolute inset-x-0 bottom-1 text-center text-xs ${today ? "font-semibold text-intelligence-foreground" : "text-muted-foreground"}`}
                        >
                          {today ? "Today · " : ""}
                          {dateLabel(day)}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {params.context.all && (
        <details open className="mt-3 rounded-xl border px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
            All saved dates · {events.length} events
          </summary>
          <ol aria-label="All saved Care events" className="space-y-2 pb-3">
            {events.map((event) => (
              <li key={event.id} className="text-sm">
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg text-primary underline focus-visible:outline-2 focus-visible:outline-ring"
                  href={event.href}
                >
                  {event.product} · {event.kind} ·{" "}
                  <time dateTime={event.date}>{event.day}</time>
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {event.evidence} ·{" "}
                  {event.sources.map((s) => s.label).join(", ")}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {!upcoming.length && (
        <p className="py-3 text-sm" data-care-calendar-empty>
          No dated Care events in this 30-day window. Missing dates are not
          inferred, and this is not a coverage or safety all-clear.
        </p>
      )}
      {upcoming.length > visible.length && (
        <p className="py-2 text-sm">
          Showing {visible.length} of {upcoming.length} upcoming events. View
          all care events in Insights for the complete list.
        </p>
      )}
      <span className="sr-only" data-care-calendar-native-query>
        AG Studio queried careEvents and verified {events.length} exact saved
        event IDs.
      </span>
    </div>
  );
}

export function CareCalendarStudio({
  calendar,
  all,
}: {
  calendar: CareCalendar;
  all: boolean;
}) {
  const { resolvedTheme } = useTheme(),
    api = useRef<AgStudioApi | null>(null),
    host = useRef<HTMLDivElement>(null),
    listeners = useRef(new Set<() => void>());
  const [width, setWidth] = useState(0),
    [rowHeight, setRowHeight] = useState(16),
    [ready, setReady] = useState(false),
    [evidence, setEvidence] = useState("all"),
    [notice, setNotice] = useState("");
  const selection = useRef({ all, evidence: "all" });
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setWidth(host.current?.clientWidth ?? 0);
      setRowHeight(
        parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
    });
    if (host.current) observer.observe(host.current);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);
  const data = useMemo(() => careCalendarData<Registry>(calendar), [calendar]);
  const tracks = width < 600 ? 30 : 22;
  useEffect(() => {
    const current = api.current;
    if (!ready || !current) return;
    const state = current.getState(),
      page = state.pages.find((p) => p.id === "care-events");
    if (
      !page?.widgetLayout?.timeline ||
      page.widgetLayout.timeline.ySpan === tracks
    )
      return;
    current.setState({
      ...state,
      pages: state.pages.map((p) =>
        p.id !== "care-events"
          ? p
          : {
              ...p,
              widgetLayout: {
                ...p.widgetLayout,
                timeline: { ...p.widgetLayout!.timeline!, ySpan: tracks },
                ...(all
                  ? {
                      events: {
                        ...p.widgetLayout!.events!,
                        yTrack: tracks + 1,
                      },
                    }
                  : {}),
              },
            },
      ),
    });
  }, [tracks, ready, all]);
  const initial = useMemo(
    () => careCalendarReport(calendar, all, tracks),
    [calendar, all, tracks],
  );
  const context = useMemo<Context>(
    () => ({
      calendar,
      all,
      selection: () => selection.current,
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
    }),
    [calendar, all],
  );
  const widgets = useMemo(
    () =>
      createWidgets<Registry>({
        additionalTypes: [
          {
            id: "care-timeline",
            label: "Saved Care timeline",
            comp: TimelineWidget,
            dataMapping: {},
            form: (p) => p.createDefaults({ dataMappingItems: [] }),
            toolbar: [],
            defaultSize: { width: 1000, height: 352 },
            minSize: { width: Math.min(240, width || 240), height: 160 },
          },
        ],
        defaultType: "care-timeline",
        menu: [
          { label: "Saved Care events", widgetIds: ["care-timeline", "grid"] },
        ],
      }),
    [width],
  );
  function filter(value: string) {
    const current = api.current;
    if (!current) return;
    const page = current.getState().pages.find((p) => p.id === "care-events");
    if (!page) return;
    const next = {
      ...current.getState(),
      pages: [
        {
          ...page,
          filter: { page: careCalendarFilter(calendar, all, value) },
          crossFilter: undefined,
        },
      ],
    };
    current.setState(next);
    if (
      JSON.stringify(current.getState().pages[0].filter) !==
      JSON.stringify(next.pages[0].filter)
    ) {
      setNotice(
        "Care event filter could not be verified; inspect the current view.",
      );
      return;
    }
    selection.current = { all, evidence: value };
    setEvidence(value);
    listeners.current.forEach((fn) => fn());
  }
  return (
    <>
      {all && (
        <label className="mx-5 my-3 inline-flex flex-wrap items-center gap-2 text-sm">
          Event evidence
          <select
            aria-label="Event evidence"
            value={evidence}
            onChange={(e) => filter(e.target.value)}
            className="min-h-11 rounded-xl border bg-background px-3"
          >
            {["all", "Demo", "Verified Sandbox", "Recorded · unverified"].map(
              (value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All evidence" : value}
                </option>
              ),
            )}
          </select>
        </label>
      )}
      <div
        ref={host}
        data-testid="care-calendar-studio"
        data-ag-theme-mode={resolvedTheme === "dark" ? "dark" : "light"}
        className="care-calendar-studio ag-theme-mode min-w-0 overflow-hidden"
        style={{ height: `${tracks + (all ? 27 : 2.5)}rem` }}
      >
        {width > 0 && (
          <AgStudio<Registry>
            style={{ width: "100%", height: "100%" }}
            data={data}
            widgets={widgets}
            context={context}
            initialState={initial as unknown as AgReportState<Registry>}
            theme={purchaseStudioTheme}
            loadThemeGoogleFonts={false}
            mode="view"
            panels={{
              view: { left: [], right: [] },
              edit: { left: [], right: [] },
            }}
            layout={{ minWidth: width, columns: 24, rowHeight }}
            onApiReady={(event) => {
              api.current = event.api as unknown as AgStudioApi;
              setReady(true);
            }}
            onErrorRaised={() =>
              setNotice(
                "Studio reported a Care timeline issue. No event or empty-state conclusion is implied.",
              )
            }
          />
        )}
      </div>
      {notice && (
        <p role="alert" className="px-5 pb-3 text-sm text-warning">
          {notice}
        </p>
      )}
    </>
  );
}
