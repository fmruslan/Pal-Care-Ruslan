import type { CareFeed } from "./model";
import { ownershipHref, type OwnershipFact } from "./ownership-contracts";

export type CareCalendarEvent = {
  id: string;
  twinId: string;
  factId: string;
  product: string;
  illustration: string;
  kind: string;
  date: string;
  day: string;
  topic: OwnershipFact["topic"];
  evidence: "Demo" | "Verified Sandbox" | "Recorded · unverified";
  detail: string;
  href: string;
  sources: OwnershipFact["sources"];
};
export type CareCalendar = {
  today: string;
  endExclusive: string;
  days: string[];
  events: CareCalendarEvent[];
  complete: boolean;
  unavailable: string[];
  snapshot?: { asOf: string; from: string; to: string };
};
const DAY = 86400000;
/** UTC calendar days: today and the next 29 days, never the frozen Demo clock. */
export function careCalendarDays(now: Date) {
  if (!Number.isFinite(now.getTime())) throw Error("invalid_calendar_clock");
  const start = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00.000Z");
  return Array.from({ length: 31 }, (_, i) =>
    new Date(start + i * DAY).toISOString().slice(0, 10),
  );
}
function validDate(value: string | null): value is string {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return false;
  const stamp = Date.parse(value);
  return (
    Number.isFinite(stamp) &&
    new Date(Date.parse(value.slice(0, 10) + "T00:00:00Z"))
      .toISOString()
      .slice(0, 10) === value.slice(0, 10)
  );
}
function eventKind(f: OwnershipFact) {
  if (["unknown", "unavailable", "not-applicable"].includes(f.state))
    return null;
  if (f.topic === "return-window") return "Return deadline";
  if (f.topic === "warranty") return "Warranty expiration";
  if (f.topic === "delivery") return "Estimated delivery";
  if (f.topic === "shipment") return "Delivery update";
  if (f.topic === "price-window" || (f.topic === "price" && f.simulation))
    return "Price-adjustment window ends";
  if (f.calendarKind === "care-reminder") return "Care reminder";
  return null;
}
/** Same ownership facts as cards/North. Payment provenance never verifies care. */
export function careCalendar(
  feed: CareFeed,
  now = new Date(feed.observedAt),
): CareCalendar {
  const days = careCalendarDays(now),
    events: CareCalendarEvent[] = [],
    seen = new Set<string>();
  for (const view of feed.ownership) {
    const p = feed.purchases.find((p) => p.id === view.twinId);
    if (!p) continue;
    for (const fact of [...view.facts, ...view.history]) {
      const kind = eventKind(fact);
      if (!kind || !validDate(fact.date) || !fact.sources.length) continue;
      // Exact Twin and semantic event, not grouped-product identity. Repeated
      // fact/history references collapse, but independent dated Twins survive.
      const normalizedDate =
        fact.date.length === 10 ? fact.date : new Date(fact.date).toISOString();
      const key = `${view.twinId}:${fact.topic}:${kind}:${normalizedDate}${fact.calendarKind ? `:${fact.id}` : ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const evidence =
        fact.simulation || p.origin === "sample"
          ? "Demo"
          : fact.verified
            ? "Verified Sandbox"
            : "Recorded · unverified";
      events.push({
        id: key,
        twinId: p.id,
        factId: fact.id,
        product: p.name,
        illustration: p.illustration ?? "computer",
        kind,
        date: fact.date,
        day: normalizedDate.slice(0, 10),
        topic: fact.topic,
        evidence,
        detail: fact.detail,
        href: `${ownershipHref(p.id, fact.topic)}&careEvent=${encodeURIComponent(fact.id)}`,
        sources: fact.sources,
      });
    }
  }
  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  return {
    today: days[0],
    endExclusive: days[30],
    days: days.slice(0, 30),
    events,
    complete: feed.complete,
    unavailable: feed.unavailable,
  };
}
export function upcomingCareEvents(calendar: CareCalendar) {
  return calendar.events.filter(
    (e) => e.day >= calendar.today && e.day < calendar.endExclusive,
  );
}
/** Homepage demo presentation only. Never move source dates or freeze live care. */
export function demoCareCalendar(feed: CareFeed): CareCalendar {
  const calendar = careCalendar(feed, new Date("2026-11-10T00:00:00Z"));
  const events = calendar.events.filter((event) => event.evidence === "Demo");
  return {
    ...calendar,
    events,
    snapshot: {
      asOf: "2026-11-10",
      from: events[0]?.day ?? calendar.today,
      to: events.at(-1)?.day ?? calendar.today,
    },
  };
}
export function careEventCounts(events: CareCalendarEvent[]) {
  return {
    demo: events.filter((e) => e.evidence === "Demo").length,
    verified: events.filter((e) => e.evidence === "Verified Sandbox").length,
    recorded: events.filter((e) => e.evidence === "Recorded · unverified")
      .length,
  };
}
