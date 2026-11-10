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
        : `Estimated arrival ${displayDate(s.estimatedAt)} in this example. No live tracking is connected.`,
      action: "View delivery details",
      nextStep:
        "Review the saved updates. There’s no live carrier connection, so a passed estimate doesn’t confirm arrival.",
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
      nextStep:
        "Start with your receipt and the seller’s terms. A retail listing alone doesn’t confirm coverage.",
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
        "Review the faults covered, exclusions and receipt requirements. These example terms don’t provide real coverage.",
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
          ? "The saved return deadline has passed. Check the seller’s terms for other options."
          : s.requiresUnopened
            ? `Unopened copies may be returnable until ${displayDate(s.endsAt)}. Check the packaging first.`
            : `The example return window ends ${displayDate(s.endsAt)}. Review the terms and your item’s condition.`,
      action: s.requiresUnopened
        ? "Check return conditions"
        : "Review return options",
      nextStep: !active
        ? "Check the saved deadline and seller’s terms for other options. Eligibility is unconfirmed; nothing has been sent."
        : s.requiresUnopened
          ? "Check that the game is unopened, keep the receipt and review the seller’s exclusions. Nothing has been sent."
          : "Review the condition requirements, deadline and any return fee before contacting the seller. Nothing has been sent.",
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
