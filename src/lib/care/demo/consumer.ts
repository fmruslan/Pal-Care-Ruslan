import type { DemoScenario } from "./contracts";
import type { OwnershipFact } from "../ownership-contracts";
import { displayDate, money } from "../../demo/presentation";
import { tenProductPack } from "./catalog";

/** Presentation only. Never grants coverage, monitoring or financial authority. */
export function consumerScenario(
  s: DemoScenario,
  active: boolean,
  asOf: string,
): NonNullable<OwnershipFact["consumer"]> {
  const evaluatedAt = Date.parse(asOf);
  if (!Number.isFinite(evaluatedAt)) throw Error("invalid_care_clock");
  const pending = "startsAt" in s && evaluatedAt < Date.parse(s.startsAt);
  const knownTerms =
    "terms" in s &&
    tenProductPack.scenarios.some(
      (original) =>
        original.id === s.id &&
        original.twinId === s.twinId &&
        original.productId === s.productId &&
        original.kind === s.kind &&
        "terms" in original &&
        original.terms === s.terms,
    );
  if (s.kind === "delivery") {
    const due = evaluatedAt >= Date.parse(s.estimatedAt);
    const latest = s.updates
      .filter((u) => Date.parse(u.at) <= evaluatedAt)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    const lastUpdate = latest
      ? ` Last saved update: ${{ prepared: "prepared", dispatched: "dispatched", "in-transit": "in transit" }[latest.status]}.`
      : "";
    return {
      status: due ? "Delivery unconfirmed" : "Delivery expected",
      summary: `Estimated arrival: ${displayDate(s.estimatedAt)}.${lastUpdate}`,
      action: "View delivery details",
      nextStep:
        "Check the seller’s shipping confirmation for a tracking link. No live tracking is connected.",
    };
  }
  if (s.kind === "safety")
    return {
      status: "Safety review",
      summary:
        "Check the model and batch details against the notice. No recall match is confirmed.",
      action: "Check safety details",
      nextStep:
        "Compare the label on your product with the official notice, including its model and batch restrictions. A similar product name is not a match.",
    };
  if (s.kind === "gap")
    return {
      status: "Coverage details needed",
      summary:
        "Your receipt is saved. Coverage terms for this item are missing.",
      action: "View purchase details",
      nextStep: "Ask the seller for the terms that apply to this purchase.",
    };
  if (s.kind === "warranty")
    return {
      status: active
        ? "Warranty details"
        : pending
          ? "Warranty not started"
          : "Warranty period ended",
      summary: `${s.extended ? "Extended plan" : "Warranty term"} ${active || pending ? "ends" : "ended"} ${displayDate(s.endsAt)}. ${!knownTerms ? "Open the saved terms for coverage and exclusions." : s.extended ? "Mechanical faults only; misuse and consumables excluded." : s.terms.includes("stitching") ? "Stitching defects only; wear and water damage excluded." : "Defects only; accidental damage excluded."}`,
      action: "View warranty",
      nextStep:
        "Check the seller’s actual warranty before arranging a repair. These illustrative terms do not establish real coverage.",
    };
  if (s.kind === "return-window")
    return {
      status: pending
        ? "Return window not started"
        : !active
          ? "Window ended"
          : `Return ends ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(s.endsAt))}`,
      summary: `Return deadline: ${displayDate(s.endsAt)}. ${!knownTerms ? "Open the saved terms for return conditions." : s.requiresUnopened ? "Unopened physical game and original receipt required; opened and digital copies excluded." : "Clean condition and original proof required; $20 restocking charge."}`,
      action: s.requiresUnopened
        ? "Check return conditions"
        : "Review return options",
      nextStep: !active
        ? "Contact the seller about any exceptions. Item condition and seller acceptance aren’t recorded."
        : s.requiresUnopened
          ? "Check that the game is unopened, keep the receipt and review the seller’s exclusions. Nothing has been sent."
          : "Check the item’s condition and contact the seller before the deadline. Seller acceptance is unconfirmed.",
    };
  const drop = s.observations[0].priceMinor - s.observations[1].priceMinor;
  return {
    status: pending
      ? "Price review not started"
      : !active
        ? "Price review window closed"
        : drop > 0
          ? "Price review example"
          : "Price check example",
    summary:
      drop > 0
        ? `This example shows a ${money(drop)} catalog difference from a hypothetical ${money(s.hypotheticalPurchaseMinor)} purchase price. Your paid price is missing, so eligibility is unverified.`
        : "The example checks show no lower catalog price. No external tracker is connected.",
    action: drop > 0 ? "Review price details" : "View price checks",
    nextStep:
      drop > 0
        ? "Find your receipt to confirm what you paid, then check the model, seller’s policy and deadline. This example difference is not savings."
        : "Review the saved checks and exact model. These examples aren’t live external tracking or a promise of an adjustment.",
  };
}
