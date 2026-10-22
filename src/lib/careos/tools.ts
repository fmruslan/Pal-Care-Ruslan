import type { DemoData } from "../../db/schema";
import { findTwin, displayDate, money } from "../demo/presentation";
import {
  contextOf,
  type CareAnswer,
  type Intent,
  type TurnInput,
} from "./contracts";

// Read tools have no commerce runtime dependency and no visitor identity arguments.
export function interpret(message: string): Intent {
  const text = message.toLowerCase();
  if (
    /refund|capture|buy |purchase (another|a new)|ignore .*instruction|system prompt|api.?key|secret/.test(
      text,
    )
  )
    return "unsupported";
  if (/receipt|invoice|proof of payment/.test(text)) return "receipt";
  if (/replace|replacement|alternative/.test(text)) return "replacement";
  if (
    /clean|maintain|maintenance|care|repair|setup|set up|troubleshoot/.test(
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
  if (intent === "receipt" || intent === "documents") {
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
