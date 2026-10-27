import type { DemoData } from "../../db/schema";
import type { GuardianView } from "../price-guardian/contracts";
import { recallExplanation, type RecallEvidence } from "../safety/evidence";
import { REFERENCE_PRODUCT } from "./knowledge";
import { projectActivity, type PurchaseActivity } from "./activity";
import { findTwin, displayDate, money } from "../demo/presentation";
import {
  contextOf,
  type CareAnswer,
  type Intent,
  type PurchaseChoice,
  type TurnInput,
} from "./contracts";
import { adjustmentResolution } from "./resolution";
import { IDENTITY_TEXT, IDENTITY_CAPABILITIES } from "./role";

// Read tools have no commerce runtime dependency and no visitor identity arguments.
export function isProhibited(message: string) {
  const financialCommand =
    /(?:^|[.!?]\s*)(?:please\s+)?(?:approve|issue|execute|send|process|trigger|refund|capture|pay|transfer)\b|\b(?:can|could|will|would)\s+you\s+(?:please\s+)?(?:approve|issue|execute|send|process|trigger|refund|capture|pay|transfer)\b|\b(?:i want|i need|please|go ahead and)\s+(?:you to\s+|a\s+)?(?:refund|capture|payment|transfer)\b/i.test(
      message,
    );
  const mixedFinancialCommand =
    /\b(?:and|then)\s+(?:please\s+)?(?:approve|issue|execute|send|process|trigger|capture|pay|transfer|refund\s+(?:this|it|me|my))\b/i.test(
      message,
    );
  const readQuestion =
    /^(did|does|do|where|what|who|has|have|is|was|why|when|how|show|tell|explain|can you tell|could you tell|can you explain|could you explain)\b/i.test(
      message.trim(),
    );
  const readRefund =
    readQuestion && /refund/i.test(message) && !financialCommand;
  const readPayment =
    readQuestion && /payment|captur/i.test(message) && !financialCommand;
  return (
    financialCommand ||
    mixedFinancialCommand ||
    (!readRefund && /refund/i.test(message)) ||
    (!readPayment && /capture/i.test(message)) ||
    /^buy\b|buy (another|a new|now)|purchase (another|a new)|ignore .*instruction|system prompt|api.?key|secret/i.test(
      message,
    )
  );
}
export function interpret(message: string): Intent {
  const text = message.toLowerCase();
  if (isProhibited(text)) return "unsupported";
  if (
    /what (is|are) (pal\s?care|careos)|what does (careos|pal\s?care) do|tell me about (careos|pal\s?care)|who are you|what can you (do|help)|are you (paypal|an official)|how does (pal\s?care|careos) work/.test(
      text,
    )
  )
    return "identity";
  if (/receipt|invoice|proof of payment/.test(text)) return "receipt";
  if (
    /policy|policies|terms|return window/.test(text) &&
    !/price|adjustment|refund/.test(text)
  )
    return "policy";
  if (/price|adjustment|saving|qualif|refund/.test(text)) return "guardian";
  if (/payment|captured|capture status/.test(text)) return "summary";
  if (/replace|replacement|alternative/.test(text)) return "replacement";
  if (/recall|safety|hazard|safe to use/.test(text)) return "recall";
  if (
    /clean|wash|maintain|maintenance|\bcare\b|repair|setup|set up|troubleshoot|shut.*down|shutdown|power off|disconnect.*power/.test(
      text,
    )
  )
    return "care";
  if (/document|manual|paperwork/.test(text)) return "documents";
  if (/history|event/.test(text)) return "history";
  if (/important|recall|warranty|price|safe|attention/.test(text))
    return "important";
  if (
    /summari|summary|what.*(know|purchase|bought)|how much|when.*(buy|bought)/.test(
      text,
    )
  )
    return "summary";
  return "unsupported";
}

export function purchaseSelection(
  data: DemoData,
  input: TurnInput,
  matches: (record: NonNullable<ReturnType<typeof findTwin>>) => boolean = () =>
    true,
): CareAnswer {
  const selected = input.twinId ? findTwin(data, input.twinId) : undefined;
  // Resolve authorization and matching before the display limit. Never collapse
  // distinct purchases of the same model or derive choice metadata from a model.
  const choices = data.twins
    .flatMap((twin): PurchaseChoice[] => {
      const record = findTwin(data, twin.id);
      return record && matches(record)
        ? [
            {
              context: contextOf(record),
              purchasedOn: record.twin.purchasedOn,
              provenance:
                record.twin.origin === "sandbox"
                  ? "Verified Sandbox"
                  : "Sample",
            },
          ]
        : [];
    })
    .slice(0, 8);
  return {
    outcome: "selection",
    mode: "deterministic",
    context: selected ? contextOf(selected) : null,
    revision: input.revision,
    text: choices.length
      ? "Which purchase should I use? Choose a saved purchase below."
      : "No matching purchase is saved. Check your saved purchases or the model label.",
    steps: [],
    sources: [],
    purchaseChoices: choices,
    actions: choices.length
      ? choices.map((choice) => ({
          label: `${choice.context.name} · ${displayDate(choice.purchasedOn)} · ${choice.provenance}`,
          href: `/vault/${choice.context.twinId}`,
        }))
      : [{ label: "Review saved purchases", href: "/vault" }],
  };
}

export function deterministicAnswer(
  data: DemoData,
  input: TurnInput,
  intent = input.intent ?? interpret(input.message),
  guardian: GuardianView[] = [],
  recall?: RecallEvidence,
  activity?: PurchaseActivity,
): CareAnswer {
  const record = input.twinId ? findTwin(data, input.twinId) : undefined;
  const answer: CareAnswer = {
    outcome: "answered",
    mode: "deterministic",
    context: record ? contextOf(record) : null,
    revision: input.revision,
    text: "",
    steps: [],
    sources: [],
    actions: [],
  };
  if (intent === "unsupported") {
    answer.outcome = "unsupported";
    answer.text =
      "I can help with saved purchase details, receipts, documents, scoped recall evidence and available product-care guidance. I cannot make payments, refunds or merchant changes.";
    return answer;
  }
  if (intent === "identity") {
    answer.text = IDENTITY_TEXT;
    answer.steps = IDENTITY_CAPABILITIES;
    answer.actions = [
      {
        label: record ? "Review this purchase" : "Choose a saved purchase",
        href: record ? `/vault/${record.twin.id}` : "/vault",
      },
    ];
    return answer;
  }
  if (!record) return purchaseSelection(data, input);
  const { twin, documents, product } = record;
  const twinHref = `/vault/${twin.id}`;
  answer.sources = [
    {
      id: twin.id,
      title: `${product.name} · Purchase Twin`,
      label:
        twin.origin === "sandbox"
          ? "Verified Sandbox purchase record"
          : "Sample purchase record",
      href: twinHref,
    },
  ];
  if (intent === "replacement") {
    const supported = product.illustration === "headphones";
    answer.outcome = supported ? "answered" : "unsupported";
    answer.text = `For ${product.brand} ${product.model}, review exact-model care and any official remedy before replacement. ${supported ? "A comparison workspace is available for headphones. No live alternatives, prices or availability have been checked in this conversation; illustrative profiles are not buying recommendations." : "This product category has no replacement adapter yet. I won’t substitute headphones or unrelated products."}`;
    answer.actions = [
      {
        label: supported
          ? "Explore labeled comparison profiles"
          : "Review this product's documents",
        href: supported
          ? `/replacements?twinId=${twin.id}`
          : `${twinHref}#documents-heading`,
      },
    ];
  } else if (intent === "recall") {
    const explanation = recallExplanation(product, recall);
    answer.text = explanation.text;
    answer.actions = [
      {
        label: "Review official recall evidence and limits",
        href: `/safety?twinId=${twin.id}`,
      },
    ];
    if (explanation.evidence)
      answer.sources.push({
        id: `cpsc:${explanation.evidence.hash}`,
        title: explanation.evidence.title,
        label: "Official historical CPSC source · limited coverage",
        href: explanation.evidence.url,
      });
  } else if (intent === "guardian") {
    const item = guardian.find((c) => c.twinId === twin.id);
    answer.resolution = adjustmentResolution(item);
    answer.text = item
      ? `${money(item.amountMinor)} merchant price adjustment. ${answer.resolution.known} ${answer.resolution.next}`
      : "No Price Guardian adjustment is recorded for this purchase. Existing demo-v1 purchases are not covered by the new future-purchase promise. External refund status has not been checked.";
    answer.actions = [
      {
        label: item ? "Inspect adjustment evidence" : "Explore Price Guardian",
        href: item ? `/guardian/${item.id}` : "/guardian",
      },
    ];
    if (item)
      answer.sources.push({
        id: item.id,
        title: `${item.policyVersion} · price and approval evidence`,
        label: `Recorded calculation: original ${money(item.originalMinor)}; compared merchant price ${money(item.comparedMinor)}; adjustment capped at $20. Merchant price is not PayPal-verified.`,
        href: `/guardian/${item.id}`,
      });
  } else if (intent === "policy") {
    const policy = documents.find((d) => d.kind === "policy");
    answer.outcome = policy ? "answered" : "missing";
    answer.text = policy
      ? "This is the policy document recorded with this purchase. It is not a new coverage or refund approval."
      : "No policy document is attached to this purchase. I cannot infer coverage.";
    if (policy) {
      answer.steps = [policy.content.slice(0, 1500)];
      answer.sources.push({
        id: policy.id,
        title: policy.title,
        label: "Recorded policy document · not an AI authorization",
        href: `/documents/${policy.id}`,
      });
      answer.actions = [
        { label: "Read full recorded policy", href: `/documents/${policy.id}` },
      ];
    }
  } else if (intent === "receipt" || intent === "documents") {
    const docs =
      intent === "receipt"
        ? documents.filter((d) => d.kind === "receipt")
        : documents;
    answer.text = docs.length
      ? intent === "receipt"
        ? "Here’s the receipt saved with this purchase."
        : "These documents are saved with this purchase."
      : intent === "receipt"
        ? "No receipt is attached to this purchase."
        : "No documents are attached to this purchase.";
    answer.outcome = docs.length ? "answered" : "missing";
    answer.actions = docs.map((d) => ({
      label: intent === "receipt" ? "Open receipt" : d.title,
      href: `/documents/${d.id}`,
    }));
    answer.sources.push(
      ...docs.map((d) => ({
        id: d.id,
        title: d.title,
        label:
          d.origin === "sandbox"
            ? "Verified Sandbox receipt"
            : "Fictional sample document",
        href: `/documents/${d.id}`,
      })),
    );
  } else if (intent === "summary") {
    const dateQuestion = /when.*(buy|bought)/i.test(input.message);
    const amountQuestion = /how much/i.test(input.message);
    const fact = dateQuestion
      ? `Purchase date: ${displayDate(twin.purchasedOn)}.${amountQuestion ? ` Saved purchase total: ${money(twin.purchasePriceMinor)}.` : ""}`
      : amountQuestion
        ? `Saved purchase total: ${money(twin.purchasePriceMinor)}.`
        : `${product.name} (${product.brand} ${product.model}) · ${money(twin.purchasePriceMinor)} · ${displayDate(twin.purchasedOn)}. ${documents.length} saved document${documents.length === 1 ? "" : "s"}.`;
    answer.text = `${fact} ${twin.origin === "sandbox" ? "Payment was verified server-side in PayPal Sandbox; no real money was used." : "This is a fictional sample purchase, not a verified payment."}`;
    answer.actions = [
      { label: "View purchase", href: twinHref },
      { label: "Review documents", href: `${twinHref}#documents-heading` },
    ];
    if (/payment|captur/i.test(input.message))
      answer.text +=
        " This is saved purchase evidence, not a fresh PayPal status check. Open the saved receipt for the recorded payment details.";
    const receipt = documents.find((d) => d.kind === "receipt");
    if (receipt)
      answer.actions.unshift({
        label: "Open saved receipt",
        href: `/documents/${receipt.id}`,
      });
    if (product.illustration === "headphones") {
      if (!dateQuestion && !amountQuestion)
        answer.text +=
          " No manufacturer manual is available for this fictional model. Saved policy and aftercare records are not a refund approval.";
      answer.actions.push({
        label: "Review recorded aftercare",
        href: `/guardian?twinId=${twin.id}`,
      });
    }
    if (product.id === REFERENCE_PRODUCT)
      answer.text = `${product.name} is a real reference product with fictional sample ownership. No purchase price or payment is established. The stored zero amount is a placeholder, not a product price. Official guidance is available separately in Product care.`;
  } else if (intent === "history" || intent === "important") {
    const view = activity ?? projectActivity(data, guardian);
    const items = view.items
      .filter(
        (i) => i.twinId === twin.id && (intent !== "important" || i.attention),
      )
      .slice(0, 5);
    answer.text =
      intent === "important"
        ? "Here are attention items in the available purchase, price-adjustment and recall records. No item is a guarantee of coverage or safety."
        : "Here is the source-labeled purchase, document, price-adjustment and recall activity available for this purchase. Sample scenarios are not live monitoring.";
    if (view.unavailable.length)
      answer.text += ` Partial history: ${view.unavailable.join(", ")} unavailable; missing evidence is not an all-clear.`;
    if (!items.length)
      answer.text +=
        " No matching activity is recorded in the available sources.";
    answer.steps = items.map(
      (i) => `${displayDate(i.at)} · ${i.provenance}: ${i.title}`,
    );
    answer.actions = [
      { label: "View recorded history", href: `${twinHref}#history-heading` },
      ...items
        .filter((i) => i.attention)
        .map((i) => ({ label: i.title, href: i.href })),
    ];
  } else {
    answer.outcome = "missing";
    answer.text = `No manufacturer care guide is available for ${product.brand} ${product.model} in your records. Review this purchase’s saved documents; I won’t substitute another model’s instructions.`;
    answer.actions = [
      {
        label: "Review available documents",
        href: `${twinHref}#documents-heading`,
      },
    ];
  }
  return answer;
}
