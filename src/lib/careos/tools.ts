import type { DemoData } from "../../db/schema";
import type { GuardianView } from "../price-guardian/contracts";
import { REFERENCE_PRODUCT } from "./knowledge";
import { findTwin, displayDate, money } from "../demo/presentation";
import {
  contextOf,
  type CareAnswer,
  type Intent,
  type TurnInput,
} from "./contracts";

// Read tools have no commerce runtime dependency and no visitor identity arguments.
export function isProhibited(message: string) {
  const readRefund =
    /^(where|what|has|have|is|why|when|show|tell|explain)\b.*refund/i.test(
      message.trim(),
    ) &&
    !/issue|execute|approve|send|process|ignore|give|trigger|now/i.test(
      message,
    );
  return (
    (!readRefund && /refund/i.test(message)) ||
    /capture|^buy\b|buy (another|a new|now)|purchase (another|a new)|ignore .*instruction|system prompt|api.?key|secret/i.test(
      message,
    )
  );
}
export function interpret(message: string): Intent {
  const text = message.toLowerCase();
  if (isProhibited(text)) return "unsupported";
  if (/receipt|invoice|proof of payment/.test(text)) return "receipt";
  if (/price|adjustment|saving|qualif|refund/.test(text)) return "guardian";
  if (/replace|replacement|alternative/.test(text)) return "replacement";
  if (
    /clean|wash|maintain|maintenance|care|repair|setup|set up|troubleshoot|shut.*down|shutdown|power off|disconnect.*power/.test(
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

export function deterministicAnswer(
  data: DemoData,
  input: TurnInput,
  intent = input.intent ?? interpret(input.message),
  guardian: GuardianView[] = [],
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
  if (intent === "replacement" || intent === "unsupported") {
    answer.outcome = "unsupported";
    answer.text =
      intent === "replacement"
        ? "Live replacement discovery will use Channel3 in a later stage. No live alternatives or prices have been checked."
        : "I can help with saved purchase details, receipts, documents and available product-care guidance. I cannot make payments, refunds or merchant changes.";
    return answer;
  }
  if (!record) {
    answer.outcome = "selection";
    answer.text =
      "Which purchase would you like help with? Choose a Purchase Twin below.";
    answer.actions = data.twins.slice(0, 8).flatMap((twin) => {
      const r = findTwin(data, twin.id);
      return r
        ? [
            {
              label: `${r.product.name} · ${displayDate(twin.purchasedOn)} · ${twin.origin === "sandbox" ? "Sandbox" : "Sample"}`,
              href: `/vault/${twin.id}`,
            },
          ]
        : [];
    });
    return answer;
  }
  const { twin, documents, events, product } = record;
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
  if (intent === "guardian") {
    const item = guardian.find((c) => c.twinId === twin.id);
    answer.text = item
      ? `${money(item.amountMinor)} merchant price adjustment: ${item.state.replaceAll("_", " ")}. Original ${money(item.originalMinor)}; compared merchant price ${money(item.comparedMinor)}; capped at $20 under ${item.policyVersion}. ${item.state === "completed" && item.verifiedAt ? "Refund independently verified in PayPal Sandbox." : "This is not a completed refund."} No customer claim is needed; merchant approval is required.`
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
        label: "Recorded merchant adjustment · price is not PayPal-verified",
        href: `/guardian/${item.id}`,
      });
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
    answer.text = `${product.brand} ${product.model} · ${money(twin.purchasePriceMinor)} · ${displayDate(twin.purchasedOn)}. ${twin.origin === "sandbox" ? "Payment was verified server-side in PayPal Sandbox; no real money was used." : "This is a fictional sample purchase, not a verified payment."} ${documents.length} saved document${documents.length === 1 ? "" : "s"}.`;
    answer.actions = [
      { label: "View purchase", href: twinHref },
      { label: "Review documents", href: `${twinHref}#documents-heading` },
    ];
    if (product.id === REFERENCE_PRODUCT)
      answer.text = `${product.name} is a real reference product with fictional sample ownership. No purchase price or payment is established. The stored zero amount is a placeholder, not a product price. Official guidance is available separately in Product care.`;
  } else if (intent === "history" || intent === "important") {
    answer.text =
      intent === "important"
        ? "Recall status, warranty coverage and live price monitoring have not been checked. A saved event is not proof of current coverage or safety."
        : "Here is the history recorded for this purchase. Sample scenarios are not live monitoring.";
    answer.steps = events
      .slice(0, 3)
      .map(
        (e) =>
          `${displayDate(e.occurredOn)} · ${e.origin === "sample" ? "Sample" : "Sandbox"}: ${e.title}`,
      );
    answer.actions = [
      { label: "View recorded history", href: `${twinHref}#history-heading` },
    ];
  } else {
    answer.outcome = "missing";
    answer.text = `No manufacturer care guide is available for ${product.brand} ${product.model} in your records. I won’t substitute instructions for a different model.`;
    answer.actions = [
      {
        label: "Review available documents",
        href: `${twinHref}#documents-heading`,
      },
    ];
  }
  return answer;
}
