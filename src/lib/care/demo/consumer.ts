import type { DemoScenario } from "./contracts";
import type { OwnershipFact } from "../ownership-contracts";
import { displayDate, money } from "../../demo/presentation";

/** Presentation only. Never grants coverage, monitoring or financial authority. */
export function consumerScenario(
  s: DemoScenario,
  active: boolean,
  asOf: string,
): NonNullable<OwnershipFact["consumer"]> {
  const evaluatedAt = Date.parse(asOf);
  if (!Number.isFinite(evaluatedAt)) throw Error("invalid_care_clock");
  const pending = "startsAt" in s && evaluatedAt < Date.parse(s.startsAt);
  if (s.kind === "delivery") {
    const due = evaluatedAt >= Date.parse(s.estimatedAt);
    return {
      status: due ? "Delivery unconfirmed" : "Delivery expected",
      summary: due
        ? `The ${displayDate(s.estimatedAt)} arrival estimate has passed. Delivery is not confirmed.`
        : `Estimated arrival ${displayDate(s.estimatedAt)}. This is a saved delivery example, not live tracking.`,
      action: "View delivery details",
      nextStep:
        "Review the saved delivery updates. This Demo has no live carrier connection; elapsed time does not confirm arrival.",
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
      status: "Coverage information needed",
      summary:
        "Your receipt is saved, but we don't have protection terms for this item.",
      action: "View purchase details",
      nextStep:
        "Check the receipt and seller's terms. A retail listing cannot establish your coverage.",
    };
  if (s.kind === "warranty")
    return {
      status: active
        ? "Warranty details"
        : pending
          ? "Warranty not started"
          : "Warranty period ended",
      summary: `${s.extended ? "Extended plan" : "Warranty"} example ${active ? "runs through" : pending ? "has not started; ends" : "ended on"} ${displayDate(s.endsAt)}. No real coverage is established.`,
      action: "View warranty",
      nextStep:
        "Review the covered faults, exclusions and proof-of-purchase requirements before contacting the seller. This Demo does not provide real coverage.",
    };
  if (s.kind === "return-window")
    return {
      status: pending
        ? "Return window not started"
        : !active
          ? "Return window closed"
          : `Return ends ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(s.endsAt))}`,
      summary: pending
        ? "The example return period has not started. No return eligibility is confirmed."
        : !active
          ? "The return deadline has passed. Check the seller's terms for other options."
          : s.requiresUnopened
            ? `Unopened copies may be returnable until ${displayDate(s.endsAt)}. Check the packaging first.`
            : `You have until ${displayDate(s.endsAt)} to review the return terms and your item's condition.`,
      action: s.requiresUnopened
        ? "Check return conditions"
        : "Review return options",
      nextStep: !active
        ? "Review the saved deadline and seller's terms for other options. No current return eligibility is established and nothing has been submitted."
        : s.requiresUnopened
          ? "Confirm the game is unopened, keep the receipt and review the seller's exclusions before requesting a return. Nothing has been submitted."
          : "Check the condition requirements, deadline and any return fee before contacting the seller. Nothing has been submitted.",
    };
  const drop = s.observations[0].priceMinor - s.observations[1].priceMinor;
  return {
    status: pending
      ? "Price review not started"
      : !active
        ? "Price review window closed"
        : drop > 0
          ? "Illustrative price window"
          : "Price check example",
    summary:
      drop > 0
        ? `A ${money(drop)} simulated catalog difference is shown against an illustrative ${money(s.hypotheticalPurchaseMinor)} price basis. Your purchase price is still missing; eligibility is unverified.`
        : "Saved simulated checks show no lower catalog price. No external tracker is connected.",
    action: drop > 0 ? "Review price details" : "View price watch",
    nextStep:
      drop > 0
        ? "Find your original receipt to confirm what you paid, then check the exact model, merchant policy and deadline. The demo difference is not savings."
        : "Review the recent checks and exact model. This Demo is not a live external price tracker or a promise of an adjustment.",
  };
}
