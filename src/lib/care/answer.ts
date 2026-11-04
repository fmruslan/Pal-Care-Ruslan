import type { CareAnswer } from "../careos/contracts";
import type { CareFeed } from "./model";
import { careDetailHref } from "./model";
import { evidenceLabel } from "./contracts";

/** Same server-derived facts as Care cards. No model-written statuses/amounts. */
export function careStatusAnswer(
  feed: CareFeed,
  revision: number,
  ids: string[],
  topic: string,
): CareAnswer {
  const purchases = feed.purchases.filter((p) => ids.includes(p.id));
  const items = feed.items.filter(
    (item) =>
      ids.includes(item.purchase.id) &&
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
      ? "No supported return progress is available in these loaded records. I can help prepare a return enquiry; nothing is submitted."
      : topic === "warranty"
        ? "No verified warranty expiration dates are recorded. I won't infer coverage from a purchase date. Fictional goods have no real warranty."
        : topic === "refunds"
          ? "No verified refund is recorded in the available evidence. Purchase payment evidence is not refund evidence."
          : topic === "price"
            ? "No current supported price or watch finding is available. Missing records never establish active monitoring or refund eligibility."
            : "No actions were found in the available records. This is not an all-clear or a promise of monitoring, warranty coverage or refund eligibility.";
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
  return {
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
      ? `Here is what your available Care records show. ${feed.unavailable.length || !feed.complete ? "Some evidence is unavailable or incomplete. " : ""}These are source-linked findings, not permission to make financial changes.`
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
          .map(
            (item) =>
              `${item.purchase.name} (${item.purchase.purchasedOn}) — ${item.status}. ${item.detail} ${item.provenance}.`,
          ),
    sources: purchases.slice(0, 8).flatMap((p) =>
      p.documentLinks.slice(0, 2).map((d) => ({
        id: d.href.split("/").at(-1)!,
        title: d.title,
        label:
          d.origin === "sample"
            ? "Sample document"
            : "Verified Sandbox receipt",
        href: d.href,
      })),
    ),
    actions: items.length
      ? items.slice(0, 4).map((item) => ({
          label: `${item.action.label} · ${item.purchase.name}`,
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
