import { describe, it, expect } from "vitest";
import {
  careCalendar,
  careCalendarDays,
  upcomingCareEvents,
  careEventCounts,
} from "../../src/lib/care/calendar";
import { careFeed } from "../../src/lib/care/model";
import { demoData } from "../../src/lib/demo/fixtures";
import { withTenProductFixtures } from "../../src/lib/care/demo/catalog";
import { withConsumerDemoFixtures } from "../../src/lib/care/demo/consumer-evidence";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import {
  careCalendarData,
  careCalendarReport,
  expectedCalendarIds,
  validateCalendarRows,
} from "../../src/lib/intelligence/care-calendar-state";
import { careStatusAnswer } from "../../src/lib/care/answer";
const feedOf = (clock = "2026-11-05T12:00:00Z") =>
  careFeed({
    data: withConsumerDemoFixtures(
      withTenProductFixtures(structuredClone(demoData)),
    ),
    knowledge: [],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now: new Date(clock),
  });
describe("shared rolling Care calendar", () => {
  it("uses supported borderless Studio presentation without changing event rows or Insights grid layout", () => {
    const calendar = careCalendar(feedOf()),
      before = structuredClone(calendar);
    const home = careCalendarReport(calendar, false),
      insights = careCalendarReport(calendar, true);
    expect(home.pages[0].layout).toMatchObject({
      pagePadding: 0,
      widgetPadding: 0,
      widgetBorderEnabled: false,
      widgetBorderWidth: 0,
      backgroundColor: "transparent",
      widgetBackgroundColor: "transparent",
    });
    expect(insights.pages[0].layout).toBeUndefined();
    expect(insights.pages[0].widgets?.events?.type).toBe("grid");
    expect(calendar).toEqual(before);
  });
  it("keeps the exact dated product context even when it has no upcoming event", () => {
    const feed = feedOf(),
      fridge = feed.purchases.find((p) => p.name === "Refrigerator")!;
    const answer = careStatusAnswer(feed, 1, [fridge.id], "upcoming-care");
    expect(answer.context?.twinId).toBe(fridge.id);
    expect(answer.questionScope).toBe("purchase");
    expect(answer.steps).toEqual([]);
    expect(answer.careCalendarRange).toEqual({
      from: "2026-11-05",
      toExclusive: "2026-12-05",
    });
    expect(answer.sources).toEqual([]);
  });
  it("retains independent same-day care reminders and links their exact saved history evidence", () => {
    const feed = feedOf(),
      view = feed.ownership[0];
    const reminder = {
      ...view.facts[0],
      id: "purchase-event:reminder-one",
      calendarKind: "care-reminder" as const,
      date: "2026-11-09",
      topic: "purchase" as const,
      state: "recorded" as const,
      sources: [
        {
          label: "Saved care history",
          href: `/vault/${view.twinId}#history-heading`,
        },
      ],
    };
    view.history.push(
      reminder,
      { ...reminder, id: "purchase-event:reminder-two" },
      reminder,
    );
    const events = careCalendar(feed).events.filter(
      (e) =>
        e.kind === "Care reminder" &&
        e.factId.startsWith("purchase-event:reminder-"),
    );
    expect(events).toHaveLength(2);
    expect(events[0].href).toContain("&careEvent=purchase-event%3Areminder-");
  });
  it.each([
    "2026-11-05T12:00:00Z",
    "2026-12-20T23:59:59Z",
    "2028-02-28T00:00:00Z",
    "2030-07-12T08:00:00Z",
  ])(
    "uses exactly 30 UTC days starting today, including year/leap boundaries: %s",
    (stamp) => {
      const days = careCalendarDays(new Date(stamp));
      expect(days).toHaveLength(31);
      expect(days[0]).toBe(stamp.slice(0, 10));
      expect(Date.parse(days[30]) - Date.parse(days[0])).toBe(30 * 86400000);
      expect(new Set(days).size).toBe(31);
    },
  );
  it("never shifts fictional November dates into a later month or invents new reminders", () => {
    const calendar = careCalendar(feedOf(), new Date("2027-06-05T00:00:00Z"));
    expect(calendar.today).toBe("2027-06-05");
    expect(upcomingCareEvents(calendar)).toEqual([]);
    expect(calendar.events.length).toBeGreaterThan(0);
    expect(calendar.events.every((e) => e.evidence === "Demo")).toBe(true);
  });
  it("uses the same November 9 evaluation clock as cards/North and ages November dates out of December", () => {
    const november = feedOf("2026-11-09T12:00:00Z"),
      december = feedOf("2026-12-01T00:00:00Z");
    const calendar = careCalendar(november);
    expect(calendar.today).toBe("2026-11-09");
    expect(
      upcomingCareEvents(calendar).some((e) =>
        ["Return deadline", "Estimated delivery"].includes(e.kind),
      ),
    ).toBe(false);
    const later = careCalendar(december);
    expect(later.today).toBe("2026-12-01");
    expect(later.endExclusive).toBe("2026-12-31");
    expect(upcomingCareEvents(later)).toEqual([]);
    expect(later.events.map((e) => [e.id, e.date])).toEqual(
      calendar.events.map((e) => [e.id, e.date]),
    );
    const answer = careStatusAnswer(
      december,
      1,
      december.purchases.map((p) => p.id),
      "upcoming-care",
    );
    expect(answer.steps).toEqual([]);
    expect(answer.text).toContain("No dated events are saved in this window");
    expect(answer.ownershipAsOf).toBe(december.observedAt);
  });
  it("rejects invalid clocks rather than falling back to frozen scenario dates", () => {
    expect(() => careCalendarDays(new Date(NaN))).toThrow(
      "invalid_calendar_clock",
    );
    expect(() => careCalendar(feedOf(), new Date(NaN))).toThrow(
      "invalid_calendar_clock",
    );
  });
  it("same dated facts produce exact Twin/milestone links, separate source counts and no payment-to-care inference", () => {
    const calendar = careCalendar(feedOf());
    const events = upcomingCareEvents(calendar);
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every(
        (e) =>
          e.href ===
            `/vault/${e.twinId}?milestone=${e.topic}&careEvent=${encodeURIComponent(e.factId)}` &&
          e.sources.length > 0,
      ),
    ).toBe(true);
    expect(careEventCounts(events)).toEqual({
      demo: events.length,
      verified: 0,
      recorded: 0,
    });
    expect(events.some((e) => e.kind === "Estimated delivery")).toBe(true);
    expect(events.some((e) => e.kind === "Return deadline")).toBe(true);
    expect(calendar.events.some((e) => e.kind === "Warranty expiration")).toBe(
      true,
    );
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
  it.each([null, "", "2026-02-30", "2026-99-01", "not a date"])(
    "rejects missing/invalid dates: %s",
    (date) => {
      const feed = feedOf();
      feed.ownership[0].facts.forEach((f) => {
        f.date = date;
      });
      feed.ownership[0].history = [];
      expect(
        careCalendar(feed).events.some(
          (e) => e.twinId === feed.ownership[0].twinId,
        ),
      ).toBe(false);
    },
  );
  it("does not duplicate fact/history references or grouped products, but preserves distinct Twin identities", () => {
    const feed = feedOf(),
      view = feed.ownership.find((v) =>
        v.facts.some((f) => f.simulation && f.date),
      )!;
    const original = careCalendar(feed).events;
    view.history.push(...view.facts, ...view.facts);
    expect(careCalendar(feed).events).toEqual(original);
    const second = structuredClone(view);
    second.twinId = feed.purchases.find((p) => p.id !== view.twinId)!.id;
    feed.ownership.push(second);
    expect(careCalendar(feed).events.length).toBeGreaterThan(original.length);
  });
  it("keeps unverified reports distinct even for a Sandbox purchase", () => {
    const feed = feedOf(),
      view = feed.ownership[0],
      p = feed.purchases.find((p) => p.id === view.twinId)!;
    p.origin = "sandbox";
    const fact = {
      ...view.facts[0],
      id: "test-expiry",
      topic: "warranty" as const,
      date: "2026-11-07",
      state: "upcoming" as const,
      verified: false,
      sources: [{ label: "Saved report", href: "/documents/test" }],
      simulation: undefined,
    };
    view.facts = [fact];
    view.history = [];
    const event = careCalendar(feed).events.find(
      (e) => e.factId === "test-expiry",
    )!;
    expect(event.evidence).toBe("Recorded · unverified");
    fact.verified = true;
    expect(
      careCalendar(feed).events.find((e) => e.factId === "test-expiry")!
        .evidence,
    ).toBe("Verified Sandbox");
  });
  it("normalizes timezone timestamps to UTC and applies an exclusive upper bound", () => {
    const feed = feedOf(),
      view = feed.ownership[0];
    view.history = [];
    view.facts = [
      {
        ...view.facts[0],
        id: "edge",
        topic: "delivery",
        date: "2026-12-05T00:30:00+02:00",
        state: "upcoming",
        sources: [{ label: "source", href: "/documents/source" }],
      },
    ];
    const event = careCalendar(feed).events.find((e) => e.factId === "edge")!;
    expect(event.day).toBe("2026-12-04");
    expect(
      upcomingCareEvents(careCalendar(feed)).some((e) => e.id === event.id),
    ).toBe(true);
    view.facts[0].date = "2026-12-05T00:00:00Z";
    expect(
      upcomingCareEvents(careCalendar(feed)).some((e) => e.factId === "edge"),
    ).toBe(false);
  });
  it("native Studio definitions expose saved event IDs and actual date/evidence filters, not a pretend data marker", () => {
    const calendar = careCalendar(feedOf()),
      data = careCalendarData(calendar),
      report = careCalendarReport(calendar, false);
    expect(data.sources[0]).toMatchObject({ id: "careEvents" });
    expect(report.selectedPageId).toBe("care-events");
    expect(report.pages[0].filter?.page?.[0].field?.id).toBe("careEvents.day");
    const ids = expectedCalendarIds(calendar, false, "all");
    expect(
      validateCalendarRows(
        ids.map((id) => ({ "careEvents.id": id })),
        ids,
        calendar.events,
      ),
    ).toEqual(upcomingCareEvents(calendar));
    expect(() => validateCalendarRows([], ids, calendar.events)).toThrow();
    expect(() =>
      validateCalendarRows([{ id: "invented" }], [], calendar.events),
    ).toThrow();
    expect(() =>
      validateCalendarRows(
        ids.flatMap((id) => [{ id }, { id }]),
        ids,
        calendar.events,
      ),
    ).toThrow();
  });
  it("North returns the same rolling events, dates, sources and exact destinations without changing history or records", () => {
    const feed = feedOf(),
      before = structuredClone(feed),
      answer = careStatusAnswer(
        feed,
        1,
        feed.purchases.map((p) => p.id),
        "upcoming-care",
      ),
      events = upcomingCareEvents(careCalendar(feed));
    expect(answer.text).toContain(`${events.length} dated Care events`);
    expect(answer.text).toContain("0 verified Sandbox");
    expect(answer.steps.length).toBe(events.length);
    expect(answer.actions.at(-1)?.href).toBe(
      "/insights?view=care-events#care-events",
    );
    expect(feed).toEqual(before);
  });
});
