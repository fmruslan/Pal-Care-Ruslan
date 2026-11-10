import type { CareAnswer } from "../careos/contracts";
import type { CareFeed } from "./model";
import { careDetailHref } from "./model";
import { evidenceLabel } from "./contracts";
import { ownershipHref, ownershipTopic } from "./ownership";
import { careProductCards, careItemTopic } from "./summary";
import { demoEvidenceAnswer } from "./demo/answer";
import { careCalendar, upcomingCareEvents, careEventCounts } from "./calendar";

/** Same server-derived facts as Care cards. No model-written statuses/amounts. */
export function careStatusAnswer(
  feed: CareFeed,
  revision: number,
  ids: string[],
  topic: string,
): CareAnswer {
  const open = topic.startsWith("open_");
  const requested = open ? topic.slice(5) : topic;
  const normalized = requested === "payment" ? "purchase" : requested;
  if (normalized === "upcoming-care") {
    const calendar = careCalendar(feed),
      events = upcomingCareEvents(calendar).filter((e) =>
        ids.includes(e.twinId),
      ),
      counts = careEventCounts(events);
    const single =
      ids.length === 1
        ? feed.purchases.find((p) => p.id === ids[0])
        : undefined;
    return {
      careCalendarRange: {
        from: calendar.today,
        toExclusive: calendar.endExclusive,
      },
      outcome: calendar.complete ? "answered" : "unavailable",
      mode: "deterministic",
      revision,
      questionScope: single ? "purchase" : "library",
      context: single
        ? {
            twinId: single.id,
            name: single.name,
            model: single.model,
            origin: single.origin,
            purchasedOn: single.purchasedOn,
          }
        : null,
      text: `Your next 30 days (${calendar.today} through ${calendar.days[29]}, UTC): ${events.length} dated Care events — ${counts.demo} Demo, ${counts.verified} verified Sandbox, ${counts.recorded} recorded but unverified. ${events.length ? "Demo events remain fictional; delivery dates are estimates, not confirmed delivery." : "No dated events are saved in this window. Missing dates are not inferred; this is not a coverage or safety all-clear."}${calendar.complete ? "" : " Some Care evidence is unavailable; this may be incomplete."}`,
      steps: events
        .slice(0, 16)
        .map((e) => `${e.product} — ${e.kind}: ${e.day} · ${e.evidence}.`),
      sources: events.slice(0, 12).flatMap((e) =>
        e.sources.slice(0, 1).map((s) => ({
          id: `${e.id}:${s.href}`,
          title: s.label,
          label: e.evidence,
          href: s.href,
        })),
      ),
      actions: [
        ...events.slice(0, 7).map((e) => ({
          label: `${e.product} · ${e.kind} · ${e.day}`,
          href: e.href,
        })),
        {
          label: "View all care events",
          href: "/insights?view=care-events#care-events",
        },
      ],
      careSelection: [...new Set(events.map((e) => e.twinId))],
      ownershipAsOf: feed.observedAt,
    };
  }
  const demoAnswer = demoEvidenceAnswer(feed, revision, ids, normalized);
  if (demoAnswer) return demoAnswer;
  const selected = feed.ownership.filter((v) => ids.includes(v.twinId));
  const homepage = careProductCards(feed, false);
  const careHighlights = selected
    .flatMap((view) => {
      const card = homepage.find((card) => card.view?.twinId === view.twinId);
      if (!card) return [];
      const target = ownershipTopic(normalized) ?? careItemTopic(card.item);
      return view.facts.some((fact) => fact.topic === target)
        ? [{ twinId: view.twinId, topic: target, revision: view.revision }]
        : [];
    })
    .slice(0, 4);
  if (
    ownershipTopic(normalized) ||
    (normalized === "summary" && selected.length === 1)
  ) {
    const scoped =
      selected.length > 1 && ["price", "refunds"].includes(normalized)
        ? selected.filter((view) =>
            view.facts.some(
              (fact) =>
                (fact.topic === normalized ||
                  (normalized === "price" && fact.topic === "watch")) &&
                !["unknown", "unavailable"].includes(fact.state),
            ),
          )
        : selected.length > 1 &&
            ["return-window", "warranty"].includes(normalized)
          ? selected.filter((view) =>
              view.facts.some(
                (fact) =>
                  fact.topic === normalized &&
                  !["unknown", "unavailable", "not-applicable"].includes(
                    fact.state,
                  ),
              ),
            )
          : selected;
    const purchases = feed.purchases.filter((p) =>
      scoped.some((view) => view.twinId === p.id),
    );
    const matching = scoped.flatMap((view) =>
      view.facts
        .filter(
          (fact) =>
            normalized !== "summary" ||
            !view.simulation ||
            fact.topic === view.pill.topic,
        )
        .filter(
          (fact) =>
            normalized === "summary" ||
            fact.topic === normalized ||
            (normalized === "price" &&
              ["price-window", "watch"].includes(fact.topic)) ||
            (normalized === "returns" && fact.topic === "return-window"),
        )
        .sort(
          (a, b) =>
            Number(b.topic === normalized) - Number(a.topic === normalized),
        )
        .map((fact) => ({
          fact,
          view,
          purchase: purchases.find((p) => p.id === view.twinId)!,
        })),
    );
    const known = matching.some(
      ({ fact }) => !["unknown", "unavailable"].includes(fact.state),
    );
    const unavailable = selected.some(
      (view) => !view.complete || view.unavailable.length > 0,
    );
    const target = ownershipTopic(normalized);
    const single = purchases.length === 1 ? purchases[0] : null;
    const sources = matching
      .flatMap(({ fact }) => fact.sources)
      .concat(
        purchases.flatMap((p) =>
          p.documentLinks.map((d) => ({
            label: d.displayTitle ?? d.title,
            href: d.href,
          })),
        ),
      );
    return {
      careSelection: purchases.map((p) => p.id),
      ownershipAsOf: feed.observedAt,
      ...(careHighlights.length ? { careHighlights } : {}),
      ...(open && selected.length === 1 && target && matching.length
        ? {
            ownershipPresentation: {
              twinId: selected[0].twinId,
              topic: target,
              revision: selected[0].revision,
            },
          }
        : {}),
      outcome: unavailable ? "unavailable" : known ? "answered" : "missing",
      mode: "deterministic",
      revision,
      questionScope: single ? "purchase" : "library",
      context: single
        ? {
            twinId: single.id,
            name: single.name,
            model: single.model,
            origin: single.origin,
            purchasedOn: single.purchasedOn,
          }
        : null,
      text: matching.some(({ fact }) => fact.consumer)
        ? `Here’s what needs a look and what you can do next. Example events are fictional records saved on ${feed.demoAsOf}; they do not confirm a real delivery, warranty or refund.${unavailable ? " Some information is unavailable." : ""}`
        : `${known ? "Here’s what your saved purchase details show." : "No confirmed outcome or deadline is saved in the available records."}${unavailable ? " Some information is unavailable or incomplete, so a missing result is not confirmation." : ""}${normalized === "returns" ? " I can help draft an enquiry for you to review and send." : ""} Open the sources below to check the details before taking action.`,
      steps: matching
        .slice(0, 16)
        .map(({ fact, purchase }) =>
          fact.consumer
            ? `${purchase.name} (${purchase.purchasedOn}) — ${fact.consumer.status} · Example. ${fact.consumer.summary} Next: ${fact.consumer.nextStep}${fact.topic === "safety" ? " No official recall match is established." : ""}`
            : `${purchase.name} (${purchase.purchasedOn}) — ${fact.title}: ${fact.status}. ${fact.detail} ${fact.provenance}.`,
        ),
      sources: [
        ...new Map(sources.map((source) => [source.href, source])).values(),
      ]
        .slice(0, 12)
        .map((source, index) => ({
          id: `ownership-source-${index}`,
          title: source.label,
          label: "Source-linked ownership evidence · see individual provenance",
          href: source.href,
        })),
      actions: purchases.slice(0, 4).map((p) => ({
        label: `${matching.find(({ view, fact }) => view.twinId === p.id && fact.consumer)?.fact.consumer?.action ?? `Review ${normalized === "summary" ? "ownership" : normalized}`} · ${p.name}`,
        href:
          matching.find(
            ({ view, fact }) => view.twinId === p.id && fact.consumer,
          )?.fact.action?.href ?? ownershipHref(p.id, target ?? "purchase"),
      })),
    };
  }
  const purchases = feed.purchases.filter((p) => ids.includes(p.id));
  const items = feed.items.filter(
    (item) =>
      ids.includes(item.purchase.id) &&
      (topic !== "attention" || item.group === "action") &&
      (topic === "summary" ||
        topic === "attention" ||
        (topic === "price"
          ? item.kind === "price" || item.kind === "watch"
          : topic === "refunds"
            ? item.kind === "refund"
            : topic === "returns"
              ? item.kind === "return"
              : topic === "warranty"
                ? item.kind === "warranty"
                : false)),
  );
  const gaps =
    topic === "returns"
      ? "There are no saved return updates for these purchases. I can help draft an enquiry for you to review and send."
      : topic === "warranty"
        ? "No confirmed warranty end date is saved. Check the seller’s or manufacturer’s terms; a purchase date alone doesn’t establish coverage. Example products have no real warranty."
        : topic === "refunds"
          ? "No confirmed refund is saved for these purchases. A receipt confirms the payment, not a refund."
          : topic === "price"
            ? "No current price check is available. Open the purchase to review its saved price information and any applicable policy."
            : "There are no next steps in the available records. You can still open each purchase to review its documents and any missing information.";
  const recorded =
    topic === "warranty"
      ? feed.savedCare.warranties
          .filter((r) => ids.includes(r.twinId))
          .map(
            (r) =>
              `${purchases.find((p) => p.id === r.twinId)?.name ?? "Saved purchase"} — recorded date ${r.expiresOn}. ${r.basis}. ${evidenceLabel(r.evidence)}; not a coverage guarantee.`,
          )
      : topic === "returns"
        ? feed.savedCare.returns
            .filter((r) => ids.includes(r.twinId))
            .slice(-8)
            .map(
              (r) =>
                `${r.evidence.effectiveOn} — ${r.state}. ${evidenceLabel(r.evidence)}. No refund is inferred.`,
            )
        : topic === "price"
          ? feed.savedCare.watches
              .filter(
                (r) =>
                  ids.includes(r.twinId) &&
                  !items.some((i) => i.id === `watch:${r.id}`),
              )
              .map(
                (r) =>
                  `${purchases.find((p) => p.id === r.twinId)?.name ?? "Saved purchase"} — recorded watch state: ${r.state}. Last successful check: ${r.lastCheckedAt ?? "not recorded"}; expires ${r.expiresAt}. This is not proof of an active schedule or real-time monitoring.`,
              )
          : [];
  const hasFacts = items.length > 0 || recorded.length > 0;
  const consumerFor = (item: (typeof items)[number]) =>
    feed.ownership
      .find((v) => v.twinId === item.purchase.id)
      ?.facts.find((f) => f.id === item.id && f.consumer);
  return {
    ownershipAsOf: feed.observedAt,
    ...(careHighlights.length
      ? {
          careHighlights: careHighlights.filter((target) =>
            items.some((item) => item.purchase.id === target.twinId),
          ),
        }
      : {}),
    careSelection: ["summary", "attention", "price", "refunds"].includes(topic)
      ? [
          ...new Set([
            ...items.map((item) => item.purchase.id),
            ...(topic === "price"
              ? feed.savedCare.watches
                  .filter((r) => ids.includes(r.twinId))
                  .map((r) => r.twinId)
              : []),
          ]),
        ]
      : purchases.map((p) => p.id),
    outcome:
      feed.unavailable.length || !feed.complete
        ? "unavailable"
        : hasFacts
          ? "answered"
          : "missing",
    mode: "deterministic",
    revision,
    questionScope: purchases.length === 1 ? "purchase" : "library",
    context:
      purchases.length === 1
        ? {
            twinId: purchases[0].id,
            name: purchases[0].name,
            model: purchases[0].model,
            origin: purchases[0].origin,
            purchasedOn: purchases[0].purchasedOn,
          }
        : null,
    text: hasFacts
      ? items.some(consumerFor)
        ? "Here’s what needs a look and what you can do next. Example events are fictional; open the details to review their sources and conditions."
        : `Here’s what your saved Care information shows. ${feed.unavailable.length || !feed.complete ? "Some information is unavailable or incomplete. " : ""}Open a purchase below to review its sources and next steps.`
      : `${gaps}${feed.unavailable.length || !feed.complete ? " Some evidence is unavailable or incomplete, so absence is not confirmed." : ""}`,
    steps: recorded.length
      ? [
          ...recorded,
          ...items
            .filter((i) => topic === "price" && i.kind === "price")
            .map((i) => `${i.purchase.name} — ${i.detail} ${i.provenance}.`),
        ]
      : items
          .slice(0, 8)
          .map((item) =>
            consumerFor(item)
              ? `${item.purchase.name} (${item.purchase.purchasedOn}) — ${consumerFor(item)!.consumer!.status} · Example. ${consumerFor(item)!.consumer!.summary} Next: ${consumerFor(item)!.consumer!.nextStep}`
              : `${item.purchase.name} (${item.purchase.purchasedOn}) — ${item.status}. ${item.detail} ${item.provenance}.`,
          ),
    sources: [
      ...items.flatMap((item) =>
        (consumerFor(item)?.sources ?? []).map((source) => ({
          id: `${item.id}:${source.href}`,
          title: source.label,
          label: "Example event source",
          href: source.href,
        })),
      ),
      ...purchases.slice(0, 8).flatMap((p) =>
        p.documentLinks.slice(0, 2).map((d) => ({
          id: d.href.split("/").at(-1)!,
          title: d.displayTitle ?? d.title,
          label:
            d.origin === "sample"
              ? "Example document"
              : "Verified Sandbox receipt",
          href: d.href,
        })),
      ),
    ].slice(0, 12),
    actions: items.length
      ? items.slice(0, 4).map((item) => ({
          label: `${consumerFor(item)?.consumer?.action ?? item.action.label} · ${item.purchase.name}`,
          href: item.action.href,
        }))
      : purchases.slice(0, 4).map((p) => ({
          label: `Review ${p.name} · ${p.purchasedOn}`,
          href: careDetailHref(
            p.id,
            topic === "warranty"
              ? "warranty"
              : topic === "returns"
                ? "returns"
                : topic === "price"
                  ? "price"
                  : "overview",
          ),
        })),
  };
}
