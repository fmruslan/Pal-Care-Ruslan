"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductArt } from "../product-art";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import {
  careEventCounts,
  type CareCalendar,
  type CareCalendarEvent,
} from "@/lib/care/calendar";

const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T00:00:00Z"));

/** Presentation only: events arrive only after the Studio query is verified. */
export function CareCalendarRail({
  calendar,
  events,
  onHeight,
}: {
  calendar: CareCalendar;
  events: CareCalendarEvent[];
  onHeight: (height: number) => void;
}) {
  const content = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ previous: false, next: false });
  const counts = careEventCounts(events),
    upcoming = events.filter((e) => calendar.days.includes(e.day)),
    visible = upcoming.slice(0, 12);
  const weeks = [0, 7, 14, 21, 28].map((start) =>
    calendar.days.slice(start, start + 7),
  );
  useEffect(() => {
    const measure = () => {
      if (content.current)
        onHeight(content.current.getBoundingClientRect().height);
      const el = scroller.current;
      if (el)
        setPosition({
          previous: el.scrollLeft > 1,
          next: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
        });
    };
    const observer = new ResizeObserver(measure);
    if (content.current) observer.observe(content.current);
    if (scroller.current) {
      observer.observe(scroller.current);
      if (scroller.current.firstElementChild)
        observer.observe(scroller.current.firstElementChild);
      scroller.current.addEventListener("scroll", measure, { passive: true });
    }
    measure();
    const el = scroller.current;
    return () => {
      observer.disconnect();
      el?.removeEventListener("scroll", measure);
    };
  }, [onHeight]);
  function move(direction: number) {
    const el = scroller.current;
    if (el)
      el.scrollBy({
        left: direction * el.clientWidth * 0.8,
        behavior: "instant",
      });
  }
  if (calendar.snapshot) {
    const fullDate = (day: string) =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(day + "T00:00:00Z"));
    return (
      <div
        ref={content}
        className="care-rail-content"
        data-care-calendar-presentation="demo-snapshot"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-intelligence-border bg-intelligence px-3 py-1.5 font-semibold text-intelligence-foreground">
            Demo snapshot · {fullDate(calendar.snapshot.asOf)}
          </span>
          <span data-care-calendar-dates>
            Saved dates: {fullDate(calendar.snapshot.from)} –{" "}
            {fullDate(calendar.snapshot.to)} · UTC
          </span>
        </div>
        <div
          role="region"
          aria-label="Demo care timeline snapshot"
          data-care-calendar-viewport
        >
          <ol
            aria-label="All demo care events"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {events.map((event) => (
              <li
                key={event.id}
                className="relative min-w-0 border-l-2 border-intelligence-border pl-3"
              >
                <span
                  aria-hidden="true"
                  className="absolute -left-[5px] top-4 size-2 rounded-full bg-intelligence-accent"
                />
                <Link
                  href={event.href}
                  data-care-calendar-event={event.id}
                  className="flex h-full min-w-0 flex-wrap items-start gap-2.5 rounded-xl border bg-background p-3 text-sm transition-colors hover:border-intelligence-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
                >
                  <span className="shrink-0 [&>div]:size-9 [&_svg]:h-9 [&_svg]:w-10">
                    <ProductArt kind={event.illustration} size="thumbnail" />
                  </span>
                  <span className="min-w-0 flex-1 basis-28 break-words">
                    <time
                      dateTime={event.date}
                      className="mb-1 block text-xs font-semibold text-intelligence-foreground"
                    >
                      {fullDate(event.day)}
                    </time>
                    <span className="block font-semibold leading-5">
                      {event.product}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {event.kind}
                    </span>
                    <span
                      className="sr-only"
                      data-care-event-provenance={event.evidence}
                    >
                      Sample event
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
        {!events.length && (
          <p
            data-care-calendar-empty
            className="py-3 text-sm text-muted-foreground"
          >
            No dated sample care events are saved. Missing dates are not
            invented.
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {events.length} saved sample events · Dates stay fixed for this demo.
          Delivery estimates are not confirmed arrivals; warranty examples are
          not verified coverage.
        </p>
        <span data-care-event-counts className="sr-only">
          {counts.demo} Sample · {counts.verified} verified Sandbox ·{" "}
          {counts.recorded} recorded, unverified
        </span>
      </div>
    );
  }
  return (
    <div
      ref={content}
      className="care-rail-content"
      data-care-calendar-presentation="consumer"
    >
      <div className="care-rail-tools">
        <span
          data-care-calendar-dates
          className="text-xs text-muted-foreground"
        >
          {dateLabel(calendar.today)} – {dateLabel(calendar.days[29])},{" "}
          {calendar.days[29].slice(0, 4)} · UTC
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="care-rail-control"
            aria-label="Previous dates"
            disabled={!position.previous}
            onClick={() => move(-1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className="care-rail-control px-2 text-xs"
            onClick={() =>
              scroller.current?.scrollTo({ left: 0, behavior: "instant" })
            }
          >
            Today
          </button>
          <button
            type="button"
            className="care-rail-control"
            aria-label="Next dates →"
            disabled={!position.next}
            onClick={() => move(1)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="30-day Care calendar, scroll horizontally"
        tabIndex={0}
        className="care-rail-viewport"
        data-care-calendar-viewport
      >
        <div className="care-rail-track">
          <svg
            className="care-rail-line"
            aria-hidden="true"
            focusable="false"
            width="100%"
            height="2"
            preserveAspectRatio="none"
          >
            <line
              x1="0"
              y1="1"
              x2="100%"
              y2="1"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          {weeks.map((days, week) => (
            <div key={days[0]} className="care-rail-week">
              <div className="care-rail-week-label" data-care-week={week + 1}>
                <span className="font-semibold text-foreground">
                  Week {week + 1}
                </span>
                <span data-care-calendar-dates>
                  {dateLabel(days[0])} – {dateLabel(days.at(-1)!)}
                </span>
              </div>
              <div className="care-rail-days">
                {days.map((day, index) => {
                  const items = visible.filter((e) => e.day === day),
                    today = day === calendar.today;
                  const labelled =
                    today ||
                    items.length > 0 ||
                    index === 0 ||
                    day === calendar.days[29];
                  return (
                    <div
                      key={day}
                      className="care-rail-day"
                      style={{
                        width: `${Math.max(items.length * 11, today ? 3.5 : index === 0 ? 4 : day === calendar.days[29] ? 4 : 0.65)}rem`,
                      }}
                    >
                      <ol
                        aria-label={`Care events ${day}`}
                        className="care-rail-events"
                      >
                        {items.map((event) => (
                          <li key={event.id}>
                            <Link
                              href={event.href}
                              data-care-calendar-event={event.id}
                              className="care-rail-event"
                            >
                              <span className="care-rail-art">
                                <ProductArt
                                  kind={event.illustration}
                                  size="thumbnail"
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="care-rail-product">
                                  {event.product}
                                </span>
                                <span className="care-rail-kind">
                                  {event.kind}
                                </span>
                                <span className="care-rail-date">
                                  <time dateTime={event.date}>
                                    {dateLabel(day)}
                                  </time>
                                  <span
                                    className={
                                      event.evidence === "Demo"
                                        ? "sr-only"
                                        : "care-rail-provenance"
                                    }
                                    data-care-event-provenance={event.evidence}
                                  >
                                    {event.evidence === "Demo"
                                      ? "Sample event"
                                      : event.evidence}
                                  </span>
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                      <div className="care-rail-date-foot">
                        {labelled && (
                          <>
                            {items.length > 0 && (
                              <span
                                className="care-rail-stem"
                                aria-hidden="true"
                              />
                            )}
                            <span
                              className={`care-rail-dot ${today ? "care-rail-dot-today" : ""}`}
                              aria-hidden="true"
                            />
                            {today && (
                              <span className="care-rail-today" data-care-today>
                                Today
                              </span>
                            )}
                            <span
                              data-care-calendar-dates
                              className={`care-rail-axis-date ${today ? "font-semibold text-intelligence-foreground" : "text-muted-foreground"}`}
                            >
                              {dateLabel(day)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!upcoming.length && (
        <p
          className="py-3 text-sm text-muted-foreground"
          data-care-calendar-empty
        >
          No dated Care events in this 30-day window. Missing dates are not
          inferred; this is not a coverage or safety all-clear.
        </p>
      )}
      {upcoming.length > visible.length && (
        <p className="py-2 text-sm text-muted-foreground">
          Showing {visible.length} of {upcoming.length} upcoming events. View
          all care events in Insights for the complete list.
        </p>
      )}
      <div className="care-rail-disclosure">
        <p>Quiet days are compressed. Delivery dates are estimates.</p>
        <span data-care-event-counts className="sr-only">
          {counts.demo} Sample · {counts.verified} verified Sandbox ·{" "}
          {counts.recorded} recorded, unverified
        </span>
      </div>
    </div>
  );
}
