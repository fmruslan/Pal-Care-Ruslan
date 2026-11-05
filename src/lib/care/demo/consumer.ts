import type { DemoScenario } from "./contracts";
import type { OwnershipFact } from "../ownership-contracts";
import { displayDate, money } from "../../demo/presentation";

/** Presentation only. Never grants coverage, monitoring or financial authority. */
export function consumerScenario(
  s: DemoScenario,
  active: boolean,
  ending: boolean,
): NonNullable<OwnershipFact["consumer"]> {
  if (s.kind === "delivery")
    return {
      status: "On its way",
      summary: `Estimated arrival ${displayDate(s.estimatedAt)}. Follow its journey in the delivery details.`,
      action: "Track delivery",
      nextStep:
        "Check the delivery updates and estimated arrival. This Demo has no live carrier connection.",
    };
  if (s.kind === "safety")
    return {
      status: "Safety check needed",
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
        ? s.extended
          ? "Warranty coverage"
          : "Warranty details available"
        : "Warranty period ended",
      summary: `${s.extended ? "Extended plan" : "Warranty"} details ${active ? "are available through" : "ended on"} ${displayDate(s.endsAt)}. Check what's included before arranging a repair.`,
      action: "View warranty",
      nextStep:
        "Review the covered faults, exclusions and proof-of-purchase requirements before contacting the seller. This Demo does not provide real coverage.",
    };
  if (s.kind === "return-window")
    return {
      status: !active
        ? "Return window closed"
        : s.requiresUnopened && s.condition === "unknown"
          ? "Check before you return"
          : ending
            ? "Return window closing"
            : "Time to return",
      summary: !active
        ? "The return deadline has passed. Check the seller's terms for other options."
        : s.requiresUnopened
          ? `Unopened copies may be returnable until ${displayDate(s.endsAt)}. Check the packaging first.`
          : `You have until ${displayDate(s.endsAt)} to review the return terms and your item's condition.`,
      action: s.requiresUnopened
        ? "Check return conditions"
        : "Review return options",
      nextStep: s.requiresUnopened
        ? "Confirm the game is unopened, keep the receipt and review the seller's exclusions before requesting a return. Nothing has been submitted."
        : "Check the condition requirements, deadline and any return fee before contacting the seller. Nothing has been submitted.",
    };
  const drop = s.observations[0].priceMinor - s.observations[1].priceMinor;
  return {
    status: !active
      ? "Price review window closed"
      : drop > 0
        ? "Lower price to review"
        : "Watching the price",
    summary:
      drop > 0
        ? `A ${money(drop)} lower catalog price is shown against a ${money(s.hypotheticalPurchaseMinor)} demo price basis. Your purchase price is still missing.`
        : "Price-watch preview: no lower catalog price is shown yet.",
    action: drop > 0 ? "Review price details" : "View price watch",
    nextStep:
      drop > 0
        ? "Find your original receipt to confirm what you paid, then check the exact model, merchant policy and deadline. The demo difference is not savings."
        : "Review the recent checks and exact model. This Demo is not a live external price tracker or a promise of an adjustment.",
  };
}
