"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ArrowRight } from "lucide-react";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import type { CareCalendar } from "@/lib/care/calendar";

const Studio = dynamic(
  () => import("./calendar-studio").then((m) => m.CareCalendarStudio),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="min-h-80 p-5 text-sm">
        Loading saved Care events…
      </p>
    ),
  },
);
class CalendarBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert" className="p-5 text-sm text-warning">
        Your timeline couldn’t load. You can still open your products and their
        saved sources below. Missing events don’t mean there are no issues.
      </p>
    ) : (
      this.props.children
    );
  }
}
export function CareCalendarPanel({
  calendar,
  studioAllowed,
  all = false,
}: {
  calendar: CareCalendar;
  studioAllowed: boolean;
  all?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (calendar.snapshot) return;
    const nextMidnight = Date.parse(calendar.today + "T00:00:00Z") + 86400000;
    const timer = setTimeout(
      () => router.refresh(),
      Math.max(1000, nextMidnight - Date.now() + 100),
    );
    const refresh = () => {
      if (
        document.visibilityState === "visible" &&
        new Date().toISOString().slice(0, 10) !== calendar.today
      )
        router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [calendar.today, calendar.endExclusive, calendar.snapshot, router]);
  return (
    <section
      id={all ? "care-events" : "next-30-days"}
      aria-labelledby={all ? "care-events-title" : "care-calendar-title"}
      className={
        all
          ? "mb-6 min-w-0 rounded-2xl border bg-card shadow-sm"
          : "care-calendar-panel mb-6 min-w-0"
      }
      data-care-calendar-range={
        calendar.snapshot
          ? `${calendar.snapshot.from}/${calendar.snapshot.to}`
          : `${calendar.today}/${calendar.endExclusive}`
      }
      data-care-calendar-snapshot={calendar.snapshot?.asOf}
    >
      <div
        className={
          all
            ? "flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 pt-4 sm:px-5"
            : "care-calendar-heading"
        }
      >
        <div
          className={
            calendar.snapshot
              ? "flex min-w-0 flex-wrap items-start gap-3"
              : "flex items-start gap-3"
          }
        >
          <CalendarDays
            aria-hidden="true"
            className={
              all
                ? "mt-1 size-6 shrink-0 text-intelligence-foreground"
                : "care-calendar-icon"
            }
          />
          <div
            className={
              calendar.snapshot ? "min-w-0 flex-1 basis-48" : undefined
            }
          >
            <h2
              id={all ? "care-events-title" : "care-calendar-title"}
              className={
                all
                  ? "text-lg font-semibold"
                  : "text-xl font-semibold tracking-tight sm:text-2xl"
              }
            >
              {all
                ? "All care events"
                : calendar.snapshot
                  ? "Your care timeline"
                  : "Your next 30 days"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {all
                ? "Dated events from your saved Care evidence, including past and later dates."
                : calendar.snapshot
                  ? "Fictional care examples with their original dates — not a live forecast or verified coverage."
                  : "Upcoming dates for what you own. Select an event to open its exact product and evidence."}
            </p>
          </div>
        </div>
        {!all && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-muted-foreground">
              Interactive calendar · AG Studio
            </span>
            <Link
              href="/insights?view=care-events#care-events"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-intelligence-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              View all care events
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        )}
      </div>
      {!calendar.complete && (
        <p role="status" className="px-5 pt-2 text-sm text-warning">
          Some Care evidence is unavailable. This timeline may be incomplete; no
          events is not an all-clear.
        </p>
      )}
      {studioAllowed ? (
        <CalendarBoundary>
          <Studio key={calendar.today} calendar={calendar} all={all} />
        </CalendarBoundary>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          Interactive Care timeline requires the existing permitted AG Studio
          evaluation or approved license configuration. No events have been
          inferred. Your saved product records remain available below.
        </p>
      )}
    </section>
  );
}
