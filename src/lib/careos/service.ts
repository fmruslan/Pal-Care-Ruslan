import type { DemoData } from "../../db/schema";
import { findTwin } from "../demo/presentation";
import { CareError, type CareTurn, type TurnInput } from "./contracts";
import { retrievePassages, type KnowledgeSource } from "./knowledge";
import { deterministicAnswer, interpret, isProhibited } from "./tools";
import { fixtureCare } from "./providers/fixture";
import { groundedAnswer } from "./grounding";
import type { CareModel, ModelResult } from "./providers/responses";
import type { GuardianView } from "../price-guardian/contracts";
import type { RecallEvidence } from "../safety/evidence";
import { referenceContext } from "./journey";
import type { PurchaseActivity } from "./activity";

function modelPayload(
  task: "classify" | "care",
  question: string,
  product: { brand: string; model: string } | null,
  past: { question: string; answer: string }[],
  sources: KnowledgeSource[] = [],
) {
  const history = [...past],
    passages = [...sources];
  const serialize = () =>
    JSON.stringify({
      task,
      question,
      product,
      history,
      untrustedPassages: passages.map((s) => ({
        id: s.id,
        title: s.title,
        section: s.section,
        content: s.content,
      })),
    });
  let payload = serialize();
  while (Buffer.byteLength(payload, "utf8") > 19000 && history.length) {
    history.shift();
    payload = serialize();
  }
  while (Buffer.byteLength(payload, "utf8") > 19000 && passages.length > 1) {
    passages.pop();
    payload = serialize();
  }
  if (Buffer.byteLength(payload, "utf8") > 19000)
    throw new CareError("careos_context_too_large", 400);
  return { payload, passages };
}

export async function resolveTurn(options: {
  data: DemoData;
  input: TurnInput;
  sources: KnowledgeSource[];
  history: CareTurn[];
  mode: "fixture" | "disabled" | "responses";
  model?: CareModel;
  call?: <T>(
    work: (signal: AbortSignal) => Promise<ModelResult<T>>,
  ) => Promise<T>;
  guardian?: GuardianView[];
  recall?: RecallEvidence;
  load?: {
    knowledge: () => Promise<KnowledgeSource[]>;
    guardian: () => Promise<GuardianView[]>;
    recall: () => Promise<RecallEvidence>;
    activity?: () => Promise<PurchaseActivity>;
  };
}) {
  const { data, input, mode, model, call } = options;
  let sources = options.sources;
  if (input.example) {
    if (input.twinId) throw new CareError("careos_invalid_context", 400);
    const intent = isProhibited(input.message)
      ? "unsupported"
      : (input.intent ?? interpret(input.message));
    const recall =
      intent === "recall" && options.load
        ? await options.load.recall()
        : options.recall;
    return {
      outcome:
        intent === "receipt" || intent === "documents"
          ? ("missing" as const)
          : intent === "unsupported"
            ? ("unsupported" as const)
            : ("answered" as const),
      mode: "deterministic" as const,
      context: referenceContext,
      revision: input.revision,
      text:
        intent === "unsupported"
          ? "I cannot authorize payments, refunds or merchant changes."
          : intent === "receipt" || intent === "documents"
            ? "This fictional Insignia ownership example has no Purchase Twin, PayPal payment or saved receipt."
            : intent === "recall" && recall?.unavailable
              ? "The latest recall check is unavailable. The saved historical notice is not a current all-clear; verify the exact model and official remedy."
              : "This is fictional ownership of an Insignia NS-AF34D2 air fryer, not your verified purchase. Review the historical official CPSC notice and exact physical identifiers first. Replacement shopping does not resolve a recall.",
      steps: [],
      sources: recall
        ? [
            {
              id: `cpsc:${recall.hash}`,
              title: recall.title,
              label: "Official historical source · limited coverage",
              href: recall.url,
            },
          ]
        : [],
      actions: [
        {
          label: "Review official recall evidence and limits",
          href: "/safety?example=insignia",
        },
        {
          label: "Explore air-fryer comparison profiles",
          href: "/replacements?example=insignia",
        },
      ],
    };
  }
  const record = input.twinId ? findTwin(data, input.twinId) : undefined;
  if (input.twinId && !record)
    throw new CareError("careos_purchase_not_found", 404);
  if (isProhibited(input.message))
    return deterministicAnswer(data, input, "unsupported");
  const question = input.message.toLowerCase();
  const mentioned = data.products.filter((product) => {
    const alias = ["headphones", "kettle", "speaker"].includes(
      product.illustration,
    )
      ? product.illustration
      : "raspberry pi";
    return (
      question.includes(product.name.toLowerCase()) ||
      question.includes(`${product.brand} ${product.model}`.toLowerCase()) ||
      question.includes(alias)
    );
  });
  if (
    mentioned.length &&
    (!record || mentioned.some((product) => product.id !== record.product.id))
  ) {
    const selection = deterministicAnswer(
      data,
      { ...input, twinId: null },
      "receipt",
    );
    const allowed = new Set(
      data.twins
        .filter((twin) =>
          mentioned.some((product) => product.id === twin.productId),
        )
        .map((twin) => `/vault/${twin.id}`),
    );
    return {
      ...selection,
      context: record
        ? deterministicAnswer(data, input, "summary").context
        : null,
      text: "Your question mentions a different or unselected product. Choose the matching Purchase Twin so its receipt and documents stay separate.",
      actions: selection.actions.filter((action) => allowed.has(action.href)),
    };
  }
  let intent = input.intent ?? interpret(input.message);
  let classified = false;
  const history = options.history
    .filter((t) => t.answer.context?.twinId === input.twinId)
    .slice(-4)
    .map((t) => ({
      question: t.message.slice(0, 300),
      answer: [t.answer.text, ...t.answer.steps].join("\n").slice(0, 1200),
    }));
  // Language interpretation is useful only when deterministic routing is unsure.
  // Explicitly prohibited tasks never reach a model.
  const prohibited = isProhibited(input.message);
  if (prohibited) intent = "unsupported";
  if (
    !input.intent &&
    intent === "unsupported" &&
    !prohibited &&
    mode === "responses" &&
    model &&
    call
  ) {
    const { payload } = modelPayload(
      "classify",
      input.message,
      record
        ? { brand: record.product.brand, model: record.product.model }
        : null,
      history,
    );
    const classification = await call((signal) =>
      model.classify(payload, signal),
    );
    intent = classification.intent;
    classified = true;
  }
  // Only the requested evidence can make this answer unavailable. Never turn
  // unavailable relevant evidence into an empty/no-match success.
  if (options.load && record) {
    if (
      intent === "care" ||
      (intent === "documents" && /manual/i.test(input.message))
    )
      sources = await options.load.knowledge();
    if (intent === "guardian") options.guardian = await options.load.guardian();
    if (intent === "recall") options.recall = await options.load.recall();
  }
  const activity =
    record && (intent === "history" || intent === "important")
      ? await options.load?.activity?.()
      : undefined;
  const base = deterministicAnswer(
    data,
    input,
    intent,
    options.guardian,
    options.recall,
    activity,
  );
  if (classified) base.mode = "live";
  if (intent === "documents" && record && /manual/i.test(input.message)) {
    const matched = sources.some(
      (s) =>
        s.productId === record.product.id &&
        s.brand === record.product.brand &&
        s.model === record.product.model &&
        s.status === "approved",
    );
    return {
      ...base,
      outcome: matched ? ("answered" as const) : ("missing" as const),
      text: matched
        ? "Matched official guidance is available for this product. Open the guide to read its documented topics."
        : `No manufacturer manual is available for ${record.product.brand} ${record.product.model} in your records.`,
      sources: base.sources.slice(0, 1),
      actions: [
        {
          label: "Review product-care documentation",
          href: `/vault/${record.twin.id}/care`,
        },
      ],
    };
  }
  if (intent !== "care" || !record) return base;
  let evidence = retrievePassages(sources, record.product, input.message);
  if (classified && !evidence.passages.length && history.length)
    evidence = retrievePassages(
      sources,
      record.product,
      history.at(-1)!.question,
    );
  if (evidence.conflict)
    return {
      ...base,
      outcome: "conflict" as const,
      text: "The available care sources conflict. Please review the originals; I won’t combine conflicting instructions.",
      actions: [
        { label: "Review sources", href: `/vault/${record.twin.id}/care` },
      ],
    };
  if (!evidence.passages.length)
    return {
      ...base,
      text: sources.some(
        (s) => s.productId === record.product.id && s.status === "approved",
      )
        ? "The available guide does not cover that question. I won’t invent instructions; you can review its documented topics."
        : base.text,
      actions: [
        {
          label: "Review available guidance",
          href: `/vault/${record.twin.id}/care`,
        },
      ],
    };
  if (mode === "fixture") return fixtureCare(base, evidence.passages);
  if (mode === "disabled")
    return {
      ...base,
      text: "Model assistance is disabled. You can read the matched official guide directly.",
      actions: [
        {
          label: "Open product-care guide",
          href: `/vault/${record.twin.id}/care`,
        },
      ],
    };
  if (!model || !call) throw new CareError("careos_live_not_authorized");
  const selected = modelPayload(
    "care",
    input.message,
    { brand: record.product.brand, model: record.product.model },
    history,
    evidence.passages,
  );
  const explained = await call((signal) =>
    model.explain(selected.payload, signal),
  );
  return groundedAnswer(base, explained, selected.passages);
}
