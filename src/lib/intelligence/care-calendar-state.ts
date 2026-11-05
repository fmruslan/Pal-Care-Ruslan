import type {
  AgDataSourcesDefinition,
  AgReportState,
  AgBaseRegistry,
  AgFilterState,
} from "ag-studio";
import type { CareCalendar, CareCalendarEvent } from "../care/calendar";

export function careCalendarData<T extends AgBaseRegistry>(
  calendar: CareCalendar,
): AgDataSourcesDefinition<T> {
  return {
    sources: [
      {
        id: "careEvents",
        name: "Saved Care events",
        data: calendar.events.map((e) => ({ ...e })),
        fields: [
          ["id", "Exact event"],
          ["product", "Product"],
          ["kind", "Event"],
          ["day", "Date (UTC)"],
          ["evidence", "Evidence"],
          ["twinId", "Exact Purchase Twin"],
          ["href", "Evidence target"],
        ].map(([id, name]) => ({ id, name, format: "textFormat" })),
      },
    ],
  };
}
export function careCalendarFilter(
  calendar: CareCalendar,
  all: boolean,
  evidence = "all",
): AgFilterState[] {
  return [
    ...(!all
      ? [
          {
            field: { id: "careEvents.day" },
            model: {
              operator: "OR" as const,
              conditions: calendar.days.map((value) => ({
                operator: "equals" as const,
                value,
              })),
            },
          },
        ]
      : []),
    ...(evidence !== "all"
      ? [
          {
            field: { id: "careEvents.evidence" },
            model: { operator: "equals" as const, value: evidence },
          },
        ]
      : []),
  ];
}
export function careCalendarReport(
  calendar: CareCalendar,
  all: boolean,
  tracks = 22,
): AgReportState {
  return {
    selectedPageId: "care-events",
    pages: [
      {
        id: "care-events",
        filter: { page: careCalendarFilter(calendar, all) },
        widgets: {
          timeline: { type: "care-timeline", dataMapping: {} },
          ...(all
            ? {
                events: {
                  type: "grid",
                  dataMapping: {
                    cols: ["product", "kind", "day", "evidence", "twinId"].map(
                      (id) => ({ id: `careEvents.${id}` }),
                    ),
                  },
                  format: {
                    title: {
                      enabled: true,
                      text: "All dated saved Care events",
                    },
                  },
                },
              }
            : {}),
        },
        widgetLayout: {
          timeline: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: tracks },
          ...(all
            ? {
                events: { xTrack: 0, yTrack: tracks + 1, xSpan: 24, ySpan: 24 },
              }
            : {}),
        },
      },
    ],
  } as unknown as AgReportState;
}
export function expectedCalendarIds(
  calendar: CareCalendar,
  all: boolean,
  evidence: string,
) {
  return calendar.events
    .filter(
      (e) =>
        (all || calendar.days.includes(e.day)) &&
        (evidence === "all" || e.evidence === evidence),
    )
    .map((e) => e.id)
    .sort();
}
/** Engine rows must match exact server-owned events, never partial silent success. */
export function validateCalendarRows(
  rows: Record<string, unknown>[],
  expected: string[],
  events: CareCalendarEvent[],
) {
  const ids = rows.map((r) => r["careEvents.id"] ?? r.id);
  if (
    ids.some(
      (id) => typeof id !== "string" || !events.some((e) => e.id === id),
    ) ||
    new Set(ids).size !== ids.length ||
    JSON.stringify([...ids].sort()) !== JSON.stringify([...expected].sort())
  )
    throw Error("calendar_engine_rows_unverified");
  return events.filter((e) => ids.includes(e.id));
}
